import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { decodeDependentPii } from "@/lib/repos/dependents"
import { decodeIncomeConfigPii } from "@/lib/repos/income-config"
import { decodeInsurancePoliciesPii } from "@/lib/repos/insurance-policies"
import { decodeProfilePii } from "@/lib/repos/profiles"
import { decodeTaxGiroSchedulePii } from "@/lib/repos/tax-giro-schedule"
import { decodeTaxNoaDataPii } from "@/lib/repos/tax-noa-data"
import {
  decodeTaxReliefAutoPii,
  encodeTaxReliefAutoPiiPatch,
} from "@/lib/repos/tax-relief-auto"
import { decodeTaxReliefInputsPii } from "@/lib/repos/tax-relief-inputs"
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
  profileId: z.uuid().optional(),
  familyId: z.uuid().optional(),
  year: z.coerce.number().int().min(2020).max(2040).optional(),
})

const MAX_YA = 2040

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>
type FamilyDependent = {
  name: string
  birth_year: number
  relationship: string
  annual_income: number
  in_full_time_education: boolean | null
  living_with_claimant: boolean | null
  is_handicapped: boolean | null
  claimed_by_profile_id: string | null
}

async function loadFamilyDependents(
  supabase: SupabaseAdmin,
  familyId: string,
): Promise<FamilyDependent[]> {
  const { data: rawFamilyDependents } = await supabase
    .from("dependents")
    .select("*")
    .eq("family_id", familyId)
  return (rawFamilyDependents ?? []).map((d) => {
    const decoded = decodeDependentPii(d)
    return {
      ...d,
      name: decoded.name ?? d.name,
      birth_year: decoded.birth_year ?? d.birth_year,
      annual_income: decoded.annual_income ?? d.annual_income,
    }
  })
}

async function fetchSpouseIncome(
  supabase: SupabaseAdmin,
  spouseProfileId: string,
): Promise<{ annual_income: number } | null> {
  const { data: spouseIncome } = await supabase
    .from("income_config")
    .select("annual_salary_enc, bonus_estimate_enc")
    .eq("profile_id", spouseProfileId)
    .single()
  if (!spouseIncome) return null
  const decodedSpouse = decodeIncomeConfigPii(spouseIncome)
  return {
    annual_income:
      (decodedSpouse.annual_salary ?? 0) +
      (decodedSpouse.bonus_estimate ?? 0),
  }
}

function dependentsForTax(deps: FamilyDependent[]) {
  return deps.map((d) => ({
    name: d.name,
    birth_year: d.birth_year,
    relationship: d.relationship as "child" | "parent" | "grandparent",
    annual_income: d.annual_income,
    in_full_time_education: d.in_full_time_education ?? false,
    living_with_claimant: d.living_with_claimant ?? false,
    is_handicapped: d.is_handicapped ?? false,
    claimed_by_profile_id: d.claimed_by_profile_id,
  }))
}

async function persistAutoReliefs(
  supabase: SupabaseAdmin,
  profileId: string,
  year: number,
  result: TaxResult,
): Promise<void> {
  for (const item of result.reliefBreakdown.filter((r) => r.source === "auto")) {
    await supabase.from("tax_relief_auto").upsert(
      {
        profile_id: profileId,
        year,
        relief_type: item.type,
        ...encodeTaxReliefAutoPiiPatch({ amount: item.amount }),
        source: "calculated",
      },
      { onConflict: "profile_id,year,relief_type" },
    )
  }
}

async function upsertTaxEntry(
  supabase: SupabaseAdmin,
  profileId: string,
  year: number,
  calculatedAmount: number,
  existingActual: number | null,
) {
  const { data: newEntry } = await supabase
    .from("tax_entries")
    .upsert(
      {
        profile_id: profileId,
        year,
        calculated_amount: calculatedAmount,
        actual_amount: existingActual,
      },
      { onConflict: "profile_id,year" },
    )
    .select()
    .single()
  return newEntry
}

async function processProfileForTax(args: {
  supabase: SupabaseAdmin
  profileId: string
  currentYear: number
  familyDependents: FamilyDependent[]
  entries: Array<Record<string, unknown>>
  entryByProfileYear: Map<string, Map<number, Record<string, unknown>>>
  taxSnapshots: Record<string, TaxSnapshot>
  taxSnapshotsNextYa: Record<string, TaxSnapshot>
}): Promise<void> {
  const {
    supabase,
    profileId,
    currentYear,
    familyDependents,
    entries,
    entryByProfileYear,
    taxSnapshots,
    taxSnapshotsNextYa,
  } = args

  const { data: rawProfile } = await supabase
    .from("profiles")
    .select(
      "id, birth_year, birth_year_enc, gender, spouse_profile_id, marital_status",
    )
    .eq("id", profileId)
    .single()
  if (!rawProfile) return
  const profile = {
    ...rawProfile,
    birth_year:
      decodeProfilePii(rawProfile).birth_year ?? rawProfile.birth_year,
  }

  const { data: incomeConfig } = await supabase
    .from("income_config")
    .select("annual_salary_enc, bonus_estimate_enc")
    .eq("profile_id", profileId)
    .single()
  if (!incomeConfig) return
  const decodedIncome = decodeIncomeConfigPii(incomeConfig)

  const { data: insurancePolicies } = await supabase
    .from("insurance_policies")
    .select(
      "type, premium_amount_enc, frequency, coverage_amount_enc, is_active",
    )
    .eq("profile_id", profileId)

  const { data: manualReliefs } = await supabase
    .from("tax_relief_inputs")
    .select("relief_type, amount_enc")
    .eq("profile_id", profileId)
    .eq("year", currentYear)

  const spouseForTax = profile.spouse_profile_id
    ? await fetchSpouseIncome(supabase, profile.spouse_profile_id)
    : null

  const taxParams = {
    profile: {
      birth_year: profile.birth_year,
      gender: profile.gender as "male" | "female" | null,
      spouse_profile_id: profile.spouse_profile_id,
      marital_status: profile.marital_status,
    },
    profileId,
    incomeConfig: {
      annual_salary: decodedIncome.annual_salary ?? 0,
      bonus_estimate: decodedIncome.bonus_estimate ?? 0,
    },
    insurancePolicies: (insurancePolicies ?? []).map((p) => {
      const decoded = decodeInsurancePoliciesPii(p)
      return {
        type: p.type,
        premium_amount: decoded.premium_amount ?? 0,
        frequency: p.frequency,
        coverage_amount: decoded.coverage_amount ?? 0,
        is_active: p.is_active,
      }
    }),
    manualReliefs: (manualReliefs ?? []).map((r) => ({
      relief_type: r.relief_type,
      amount: decodeTaxReliefInputsPii(r).amount ?? 0,
    })),
    spouse: spouseForTax,
    dependents: dependentsForTax(familyDependents),
  }

  const result = calculateTax({ ...taxParams, year: currentYear })
  taxSnapshots[profileId] = resultToTaxSnapshot(currentYear, result)

  const nextYa = currentYear + 1
  if (nextYa <= MAX_YA) {
    const resultNext = calculateTax({ ...taxParams, year: nextYa })
    taxSnapshotsNextYa[profileId] = resultToTaxSnapshot(nextYa, resultNext)
  }

  const existingEntry = entryByProfileYear.get(profileId)?.get(currentYear) as
    | { actual_amount: number | null }
    | undefined
  const newEntry = await upsertTaxEntry(
    supabase,
    profileId,
    currentYear,
    result.taxPayable,
    existingEntry?.actual_amount ?? null,
  )
  if (newEntry) {
    const idx = entries.findIndex(
      (e) => e.profile_id === profileId && e.year === currentYear,
    )
    if (idx >= 0) entries[idx] = newEntry as Record<string, unknown>
    else entries.push(newEntry as Record<string, unknown>)
  }

  await persistAutoReliefs(supabase, profileId, currentYear, result)
}

async function loadProfileEmploymentIncomeMap(
  supabase: SupabaseAdmin,
  profileIds: string[],
): Promise<Map<string, { employmentIncome: number }>> {
  const map = new Map<string, { employmentIncome: number }>()
  for (const profileId of profileIds) {
    const { data: income } = await supabase
      .from("income_config")
      .select("annual_salary_enc, bonus_estimate_enc")
      .eq("profile_id", profileId)
      .single()
    const dec = income ? decodeIncomeConfigPii(income) : null
    const employmentIncome =
      (dec?.annual_salary ?? 0) + (dec?.bonus_estimate ?? 0)
    map.set(profileId, { employmentIncome })
  }
  return map
}

type SuggestedRelief = {
  profile_id: string
  relief_type: string
  amount: number
  label: string
}

async function buildSpouseAndDependentSuggestions(
  supabase: SupabaseAdmin,
  profileIds: string[],
  currentYear: number,
  familyDependents: FamilyDependent[],
  reliefInputs: Array<{ profile_id: string; year: number; relief_type: string }>,
): Promise<SuggestedRelief[]> {
  const suggestions: SuggestedRelief[] = []
  for (const profileId of profileIds) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("marital_status, spouse_profile_id, gender")
      .eq("id", profileId)
      .single()
    if (!profile) continue

    if (profile.marital_status === "married" && !profile.spouse_profile_id) {
      const hasManualSpouse = reliefInputs.some(
        (r) =>
          r.profile_id === profileId &&
          r.year === currentYear &&
          r.relief_type === "spouse",
      )
      if (!hasManualSpouse) {
        suggestions.push({
          profile_id: profileId,
          relief_type: "spouse",
          amount: 2000,
          label:
            "Married but no spouse linked — link in Settings > User Settings to auto-derive, or apply $2,000 manually",
        })
      }
    }

    const unclaimedParents = familyDependents.filter(
      (d) =>
        (d.relationship === "parent" || d.relationship === "grandparent") &&
        !d.claimed_by_profile_id,
    )
    for (const dep of unclaimedParents) {
      const amount = dep.living_with_claimant ? 9000 : 5500
      suggestions.push({
        profile_id: profileId,
        relief_type: "parent",
        amount,
        label: `${dep.name} (${dep.relationship}) not claimed by any profile — assign in Settings > User Settings`,
      })
    }

    if (profile.gender === "female") {
      const unclaimedChildren = familyDependents.filter(
        (d) => d.relationship === "child" && !d.claimed_by_profile_id,
      )
      if (unclaimedChildren.length > 0) {
        suggestions.push({
          profile_id: profileId,
          relief_type: "wmcr",
          amount: 0,
          label: `${unclaimedChildren.length} child(ren) not assigned — claim in Settings to unlock WMCR`,
        })
      }
    }
  }
  return suggestions
}

async function buildSrsSuggestions(
  supabase: SupabaseAdmin,
  accountId: string,
  profileIds: string[],
  currentYear: number,
  reliefInputs: Array<{ profile_id: string; year: number; relief_type: string }>,
): Promise<SuggestedRelief[]> {
  const suggestions: SuggestedRelief[] = []
  const { data: allFamilies } = await supabase
    .from("families")
    .select("id")
    .eq("household_id", accountId)
  if (!allFamilies) return suggestions

  const familyIds = allFamilies.map((f) => f.id)
  const { data: srsAccounts } = await supabase
    .from("bank_accounts")
    .select("id, opening_balance, profile_id")
    .in("family_id", familyIds)
    .eq("account_type", "srs")
  if (!srsAccounts) return suggestions

  for (const srs of srsAccounts) {
    if (!srs.profile_id || !profileIds.includes(srs.profile_id)) continue
    const hasManualSrs = reliefInputs.some(
      (r) =>
        r.profile_id === srs.profile_id &&
        r.year === currentYear &&
        r.relief_type === "srs",
    )
    if (!hasManualSrs && srs.opening_balance > 0) {
      const suggestedAmount = Math.min(srs.opening_balance, 15300)
      suggestions.push({
        profile_id: srs.profile_id,
        relief_type: "srs",
        amount: suggestedAmount,
        label: `SRS account balance: $${formatNum(srs.opening_balance)}`,
      })
    }
  }
  return suggestions
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadNoaData(
  supabase: SupabaseAdmin,
  profileIds: string[],
  currentYear: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const { data: noaDataRows } = await supabase
    .from("tax_noa_data")
    .select("*")
    .in("profile_id", profileIds)
    .eq("year", currentYear)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const noaData: Record<string, any> = {}
  for (const row of noaDataRows ?? []) {
    const decoded = decodeTaxNoaDataPii(row)
    noaData[row.profile_id] = {
      ...row,
      employment_income: decoded.employment_income,
      chargeable_income: decoded.chargeable_income,
      total_deductions: decoded.total_deductions,
      donations_deduction: decoded.donations_deduction,
      reliefs_total: decoded.reliefs_total,
      tax_payable: decoded.tax_payable,
      reliefs_json: decoded.reliefs_json,
      bracket_summary_json: decoded.bracket_summary_json,
    }
  }
  return noaData
}

async function loadGiroSchedules(
  supabase: SupabaseAdmin,
  profileIds: string[],
  currentYear: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const { data: giroRows } = await supabase
    .from("tax_giro_schedule")
    .select("*")
    .in("profile_id", profileIds)
    .eq("year", currentYear)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const giroSchedules: Record<string, any> = {}
  for (const row of giroRows ?? []) {
    const decoded = decodeTaxGiroSchedulePii(row)
    giroSchedules[row.profile_id] = {
      ...row,
      schedule: decoded.schedule,
      total_payable: decoded.total_payable,
      outstanding_balance: decoded.outstanding_balance,
    }
  }
  return giroSchedules
}

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

    const taxSnapshots: Record<string, TaxSnapshot> = {}
    const taxSnapshotsNextYa: Record<string, TaxSnapshot> = {}

    const { data: taxEntries, error: taxError } = await supabase
      .from("tax_entries")
      .select("*")
      .in("profile_id", profileIds)
      .order("year", { ascending: false })

    if (taxError) {
      return NextResponse.json({ error: "Failed to fetch tax entries" }, { status: 500 })
    }

    const entries = (taxEntries ?? []) as Array<Record<string, unknown>>
    const entryByProfileYear = new Map<string, Map<number, Record<string, unknown>>>()
    for (const e of entries) {
      const pid = e.profile_id as string
      const year = e.year as number
      if (!entryByProfileYear.has(pid)) entryByProfileYear.set(pid, new Map())
      entryByProfileYear.get(pid)!.set(year, e)
    }

    const familyDependents = await loadFamilyDependents(
      supabase,
      resolved.familyId,
    )

    for (const profileId of profileIds) {
      await processProfileForTax({
        supabase,
        profileId,
        currentYear,
        familyDependents,
        entries,
        entryByProfileYear,
        taxSnapshots,
        taxSnapshotsNextYa,
      })
    }

    const profileDetails = await loadProfileEmploymentIncomeMap(
      supabase,
      profileIds,
    )

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
      ...(reliefInputs ?? []).map((r) => ({
        ...r,
        amount: decodeTaxReliefInputsPii(r).amount ?? 0,
        source: "manual" as const,
      })),
      ...(reliefAuto ?? []).map((r) => ({
        ...r,
        amount: decodeTaxReliefAutoPii(r).amount ?? 0,
        source: "auto" as const,
      })),
    ].sort((a, b) => b.year - a.year)

    const reliefInputsList = (reliefInputs ?? []) as Array<{
      profile_id: string
      year: number
      relief_type: string
    }>

    const suggestedReliefs: SuggestedRelief[] = [
      ...(await buildSpouseAndDependentSuggestions(
        supabase,
        profileIds,
        currentYear,
        familyDependents,
        reliefInputsList,
      )),
      ...(await buildSrsSuggestions(
        supabase,
        session.accountId,
        profileIds,
        currentYear,
        reliefInputsList,
      )),
    ]

    const [noaData, giroSchedules] = await Promise.all([
      loadNoaData(supabase, profileIds, currentYear),
      loadGiroSchedules(supabase, profileIds, currentYear),
    ])

    return NextResponse.json({
      entries: entries.toSorted(
        (a, b) => (b.year as number) - (a.year as number),
      ),
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
