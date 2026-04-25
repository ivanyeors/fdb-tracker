import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { decodeDependentPii } from "@/lib/repos/dependents"
import { decodeProfilePii } from "@/lib/repos/profiles"
import { encodeTaxReliefAutoPiiPatch } from "@/lib/repos/tax-relief-auto"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { calculateTax, type TaxResult } from "@/lib/calculations/tax"
import type { TaxSnapshot } from "@/lib/tax/tax-snapshot"

function formatNum(n: number): string {
  return n.toLocaleString("en-SG", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function resultToTaxSnapshot(ya: number, result: TaxResult): TaxSnapshot {
  return {
    year: ya,
    employmentIncome: result.employmentIncome,
    totalReliefs: result.totalReliefs,
    reliefsRawTotal: result.reliefsRawTotal,
    reliefCapHeadroom: result.reliefCapHeadroom,
    chargeableIncome: result.chargeableIncome,
    taxBeforeRebate: result.taxBeforeRebate,
    rebateAmount: result.rebateAmount,
    taxPayable: result.taxPayable,
    effectiveRate: result.effectiveRate,
    marginalRate: result.marginalRate,
    marginalBandFrom: result.marginalBandFrom,
    marginalBandTo: result.marginalBandTo,
    bracketAllocation: result.bracketAllocation,
  }
}

const taxQuerySchema = z.object({
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
  year: z.coerce.number().int().min(2020).max(2040).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = request.nextUrl
    const parsed = taxQuerySchema.safeParse({
      profileId: searchParams.get("profileId") ?? undefined,
      familyId: searchParams.get("familyId") ?? undefined,
      year: searchParams.get("year") ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }
    if (!parsed.data.profileId && !parsed.data.familyId) {
      return NextResponse.json({ error: "profileId or familyId required" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      session.accountId,
      parsed.data.profileId ?? null,
      parsed.data.familyId ?? null
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }
    const { profileIds } = resolved
    const currentYear = parsed.data.year ?? new Date().getFullYear()

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", profileIds)

    // Fetch tax entries
    const taxSnapshots: Record<string, TaxSnapshot> = {}
    const taxSnapshotsNextYa: Record<string, TaxSnapshot> = {}
    const MAX_YA = 2040

    const { data: taxEntries, error: taxError } = await supabase
      .from("tax_entries")
      .select("*")
      .in("profile_id", profileIds)
      .order("year", { ascending: false })

    if (taxError) {
      return NextResponse.json({ error: "Failed to fetch tax entries" }, { status: 500 })
    }

    const entries = taxEntries ?? []
    const entryByProfileYear = new Map<string, Map<number, (typeof entries)[0]>>()
    for (const e of entries) {
      if (!entryByProfileYear.has(e.profile_id)) {
        entryByProfileYear.set(e.profile_id, new Map())
      }
      entryByProfileYear.get(e.profile_id)!.set(e.year, e)
    }

    // Always recalculate for profiles with income_config so reliefs stay in sync with profile/income changes
    // Pre-fetch dependents for the family (shared across all profiles)
    const { data: rawFamilyDependents } = await supabase
      .from("dependents")
      .select("*")
      .eq("family_id", resolved.familyId)
    const familyDependents = (rawFamilyDependents ?? []).map((d) => {
      const decoded = decodeDependentPii(d)
      return {
        ...d,
        name: decoded.name ?? d.name,
        birth_year: decoded.birth_year ?? d.birth_year,
        annual_income: decoded.annual_income ?? d.annual_income,
      }
    })

    for (const profileId of profileIds) {
      const { data: rawProfile } = await supabase
        .from("profiles")
        .select(
          "id, birth_year, birth_year_enc, gender, spouse_profile_id, marital_status",
        )
        .eq("id", profileId)
        .single()
      if (!rawProfile) continue
      const profile = {
        ...rawProfile,
        birth_year:
          decodeProfilePii(rawProfile).birth_year ?? rawProfile.birth_year,
      }

      const { data: incomeConfig } = await supabase
        .from("income_config")
        .select("annual_salary, bonus_estimate")
        .eq("profile_id", profileId)
        .single()
      if (!incomeConfig) continue

      const { data: insurancePolicies } = await supabase
        .from("insurance_policies")
        .select("type, premium_amount, frequency, coverage_amount, is_active")
        .eq("profile_id", profileId)

      const { data: manualReliefs } = await supabase
        .from("tax_relief_inputs")
        .select("relief_type, amount")
        .eq("profile_id", profileId)
        .eq("year", currentYear)

      // Fetch spouse income if linked
      let spouseForTax: { annual_income: number } | null = null
      if (profile.spouse_profile_id) {
        const { data: spouseIncome } = await supabase
          .from("income_config")
          .select("annual_salary, bonus_estimate")
          .eq("profile_id", profile.spouse_profile_id)
          .single()
        if (spouseIncome) {
          spouseForTax = {
            annual_income: (spouseIncome.annual_salary ?? 0) + (spouseIncome.bonus_estimate ?? 0),
          }
        }
      }

      const dependentsForTax = (familyDependents ?? []).map((d) => ({
        name: d.name,
        birth_year: d.birth_year,
        relationship: d.relationship as "child" | "parent" | "grandparent",
        annual_income: d.annual_income,
        in_full_time_education: d.in_full_time_education,
        living_with_claimant: d.living_with_claimant,
        is_handicapped: d.is_handicapped,
        claimed_by_profile_id: d.claimed_by_profile_id,
      }))

      const taxParams = {
        profile: {
          birth_year: profile.birth_year,
          gender: profile.gender as "male" | "female" | null,
          spouse_profile_id: profile.spouse_profile_id,
          marital_status: profile.marital_status,
        },
        profileId,
        incomeConfig: {
          annual_salary: incomeConfig.annual_salary,
          bonus_estimate: incomeConfig.bonus_estimate ?? 0,
        },
        insurancePolicies: (insurancePolicies ?? []).map((p) => ({
          type: p.type,
          premium_amount: p.premium_amount,
          frequency: p.frequency,
          coverage_amount: p.coverage_amount ?? 0,
          is_active: p.is_active,
        })),
        manualReliefs: (manualReliefs ?? []).map((r) => ({
          relief_type: r.relief_type,
          amount: r.amount,
        })),
        spouse: spouseForTax,
        dependents: dependentsForTax,
      }

      const result = calculateTax({ ...taxParams, year: currentYear })
      taxSnapshots[profileId] = resultToTaxSnapshot(currentYear, result)

      const nextYa = currentYear + 1
      if (nextYa <= MAX_YA) {
        const resultNext = calculateTax({ ...taxParams, year: nextYa })
        taxSnapshotsNextYa[profileId] = resultToTaxSnapshot(nextYa, resultNext)
      }

      const existingEntry = entryByProfileYear.get(profileId)?.get(currentYear)
      const { data: newEntry } = await supabase
        .from("tax_entries")
        .upsert(
          {
            profile_id: profileId,
            year: currentYear,
            calculated_amount: result.taxPayable,
            actual_amount: existingEntry?.actual_amount ?? null,
          },
          { onConflict: "profile_id,year" }
        )
        .select()
        .single()

      if (newEntry) {
        const idx = entries.findIndex((e) => e.profile_id === profileId && e.year === currentYear)
        if (idx >= 0) entries[idx] = newEntry
        else entries.push(newEntry)
      }

      for (const item of result.reliefBreakdown.filter((r) => r.source === "auto")) {
        await supabase.from("tax_relief_auto").upsert(
          {
            profile_id: profileId,
            year: currentYear,
            relief_type: item.type,
            amount: item.amount,
            ...encodeTaxReliefAutoPiiPatch({ amount: item.amount }),
            source: "calculated",
          },
          { onConflict: "profile_id,year,relief_type" }
        )
      }
    }

    const profileDetails = new Map<string, { employmentIncome: number }>()
    for (const profileId of profileIds) {
      const { data: income } = await supabase
        .from("income_config")
        .select("annual_salary, bonus_estimate")
        .eq("profile_id", profileId)
        .single()
      const employmentIncome = (income?.annual_salary ?? 0) + (income?.bonus_estimate ?? 0)
      profileDetails.set(profileId, { employmentIncome })
    }

    // Fetch tax relief inputs (manual) and auto-derived
    const { data: reliefInputs, error: reliefError } = await supabase
      .from("tax_relief_inputs")
      .select("*")
      .in("profile_id", profileIds)
      .order("year", { ascending: false })

    if (reliefError) {
      return NextResponse.json({ error: "Failed to fetch tax reliefs" }, { status: 500 })
    }

    const { data: reliefAuto } = await supabase
      .from("tax_relief_auto")
      .select("*")
      .in("profile_id", profileIds)
      .order("year", { ascending: false })

    const reliefs = [
      ...(reliefInputs ?? []).map((r) => ({ ...r, source: "manual" as const })),
      ...(reliefAuto ?? []).map((r) => ({ ...r, source: "auto" as const })),
    ].sort((a, b) => b.year - a.year)

    // Build suggested reliefs from existing data (SRS accounts, etc.)
    const suggestedReliefs: Array<{
      profile_id: string
      relief_type: string
      amount: number
      label: string
    }> = []

    // Check for married profiles without spouse linked — suggest spouse relief
    for (const profileId of profileIds) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("marital_status, spouse_profile_id, gender")
        .eq("id", profileId)
        .single()
      if (!profile) continue

      if (profile.marital_status === "married" && !profile.spouse_profile_id) {
        const hasManualSpouse = (reliefInputs ?? []).some(
          (r) => r.profile_id === profileId && r.year === currentYear && r.relief_type === "spouse"
        )
        if (!hasManualSpouse) {
          suggestedReliefs.push({
            profile_id: profileId,
            relief_type: "spouse",
            amount: 2000,
            label: "Married but no spouse linked — link in Settings > User Settings to auto-derive, or apply $2,000 manually",
          })
        }
      }

      // Check for parent dependents with no claimant assigned
      const unclaimedParents = (familyDependents ?? []).filter(
        (d) =>
          (d.relationship === "parent" || d.relationship === "grandparent") &&
          !d.claimed_by_profile_id,
      )
      for (const dep of unclaimedParents) {
        const amount = dep.living_with_claimant ? 9000 : 5500
        suggestedReliefs.push({
          profile_id: profileId,
          relief_type: "parent",
          amount,
          label: `${dep.name} (${dep.relationship}) not claimed by any profile — assign in Settings > User Settings`,
        })
      }

      // Check for children that could qualify for WMCR but aren't claimed by a female profile
      if (profile.gender === "female") {
        const unclaimedChildren = (familyDependents ?? []).filter(
          (d) => d.relationship === "child" && !d.claimed_by_profile_id,
        )
        if (unclaimedChildren.length > 0) {
          suggestedReliefs.push({
            profile_id: profileId,
            relief_type: "wmcr",
            amount: 0,
            label: `${unclaimedChildren.length} child(ren) not assigned — claim in Settings to unlock WMCR`,
          })
        }
      }
    }

    // Check for SRS bank accounts — suggest as SRS contribution relief
    const { data: allFamilies } = await supabase
      .from("families")
      .select("id")
      .eq("household_id", session.accountId)

    if (allFamilies) {
      const familyIds = allFamilies.map((f) => f.id)
      const { data: srsAccounts } = await supabase
        .from("bank_accounts")
        .select("id, opening_balance, profile_id")
        .in("family_id", familyIds)
        .eq("account_type", "srs")

      if (srsAccounts) {
        for (const srs of srsAccounts) {
          if (!srs.profile_id || !profileIds.includes(srs.profile_id)) continue
          // Check if SRS relief already entered manually for this profile+year
          const hasManualSrs = (reliefInputs ?? []).some(
            (r) => r.profile_id === srs.profile_id && r.year === currentYear && r.relief_type === "srs"
          )
          if (!hasManualSrs && srs.opening_balance > 0) {
            // Cap at SRS annual limit ($15,300 for citizens/PRs)
            const suggestedAmount = Math.min(srs.opening_balance, 15300)
            suggestedReliefs.push({
              profile_id: srs.profile_id,
              relief_type: "srs",
              amount: suggestedAmount,
              label: `SRS account balance: $${formatNum(srs.opening_balance)}`,
            })
          }
        }
      }
    }

    // Fetch NOA data for comparison view
    const { data: noaDataRows } = await supabase
      .from("tax_noa_data")
      .select("*")
      .in("profile_id", profileIds)
      .eq("year", currentYear)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const noaData: Record<string, any> = {}
    for (const row of noaDataRows ?? []) {
      noaData[row.profile_id] = row
    }

    // Fetch GIRO schedules
    const { data: giroRows } = await supabase
      .from("tax_giro_schedule")
      .select("*")
      .in("profile_id", profileIds)
      .eq("year", currentYear)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const giroSchedules: Record<string, any> = {}
    for (const row of giroRows ?? []) {
      giroSchedules[row.profile_id] = row
    }

    return NextResponse.json({
      entries: entries.sort((a, b) => b.year - a.year),
      reliefs,
      profiles: profiles ?? [],
      profileDetails: Object.fromEntries(profileDetails),
      taxSnapshots,
      taxSnapshotsNextYa,
      suggestedReliefs,
      noaData,
      giroSchedules,
    })
  } catch (err) {
    console.error("[api/tax] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
