import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { calculateTax } from "@/lib/calculations/tax"

const taxQuerySchema = z.object({
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
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

    const currentYear = new Date().getFullYear()

    // Fetch tax entries
    const { data: taxEntries, error: taxError } = await supabase
      .from("tax_entries")
      .select("*")
      .in("profile_id", profileIds)
      .order("year", { ascending: false })

    if (taxError) {
      return NextResponse.json({ error: "Failed to fetch tax entries" }, { status: 500 })
    }

    const entries = taxEntries ?? []
    const entriesByProfileYear = new Map<string, Set<number>>()
    for (const e of entries) {
      const key = e.profile_id
      if (!entriesByProfileYear.has(key)) entriesByProfileYear.set(key, new Set())
      entriesByProfileYear.get(key)!.add(e.year)
    }

    // Auto-calculate and upsert for profiles with income_config but no entry for current year
    for (const profileId of profileIds) {
      const hasEntryForYear = entriesByProfileYear.get(profileId)?.has(currentYear)
      if (hasEntryForYear) continue

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, birth_year")
        .eq("id", profileId)
        .single()
      if (!profile) continue

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

      const result = calculateTax({
        profile: { birth_year: profile.birth_year },
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
        year: currentYear,
      })

      const { data: newEntry } = await supabase
        .from("tax_entries")
        .upsert(
          {
            profile_id: profileId,
            year: currentYear,
            calculated_amount: result.taxPayable,
            actual_amount: null,
          },
          { onConflict: "profile_id,year" }
        )
        .select()
        .single()

      if (newEntry) entries.push(newEntry)

      for (const item of result.reliefBreakdown.filter((r) => r.source === "auto")) {
        await supabase.from("tax_relief_auto").upsert(
          {
            profile_id: profileId,
            year: currentYear,
            relief_type: item.type,
            amount: item.amount,
            source: "calculated",
          },
          { onConflict: "profile_id,year,relief_type" }
        )
      }
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

    return NextResponse.json({
      entries: entries.sort((a, b) => b.year - a.year),
      reliefs,
    })
  } catch (err) {
    console.error("[api/tax] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
