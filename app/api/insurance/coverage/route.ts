import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { decodeIncomeConfigPii } from "@/lib/repos/income-config"
import { decodeInsurancePoliciesPii } from "@/lib/repos/insurance-policies"
import { decodeProfilePii } from "@/lib/repos/profiles"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import {
  calculateCoverageGap,
  calculateOverallScore,
  type CoverageBenchmarks,
  type HouseholdCoverageAnalysis,
  type LifeStageParams,
  getLifeStageMultipliers,
} from "@/lib/calculations/insurance"
import { getAge } from "@/lib/calculations/cpf"

const querySchema = z.object({
  profileId: z.uuid().optional(),
  familyId: z.uuid().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = request.nextUrl
    const parsed = querySchema.safeParse({
      profileId: searchParams.get("profileId") ?? undefined,
      familyId: searchParams.get("familyId") ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters" },
        { status: 400 },
      )
    }
    if (!parsed.data.profileId && !parsed.data.familyId) {
      return NextResponse.json(
        { error: "profileId or familyId required" },
        { status: 400 },
      )
    }

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      session.accountId,
      parsed.data.profileId ?? null,
      parsed.data.familyId ?? null,
    )
    if (!resolved) {
      return NextResponse.json(
        { error: "Family or profile not found" },
        { status: 404 },
      )
    }
    const { profileIds } = resolved

    const [policiesRes, incomeRes, benchmarksRes, profilesRes] =
      await Promise.all([
        supabase
          .from("insurance_policies")
          .select(
            "id, profile_id, name, type, coverage_type, coverage_amount_enc, is_active, premium_amount_enc, frequency, yearly_outflow_date, insurance_policy_coverages(coverage_type, coverage_amount)",
          )
          .in("profile_id", profileIds)
          .eq("is_active", true),
        supabase
          .from("income_config")
          .select("profile_id, annual_salary_enc")
          .in("profile_id", profileIds),
        supabase
          .from("insurance_coverage_benchmarks")
          .select(
            "profile_id, death_coverage_target, ci_coverage_target, hospitalization_coverage, tpd_coverage_target, long_term_care_monthly_target",
          )
          .in("profile_id", profileIds),
        supabase
          .from("profiles")
          .select("id, name, name_enc, birth_year, birth_year_enc, marital_status, num_dependents")
          .in("id", profileIds),
      ])

    const policies = (policiesRes.data ?? []).map((p) => {
      const decoded = decodeInsurancePoliciesPii(p)
      return {
        ...p,
        premium_amount: decoded.premium_amount,
        coverage_amount: decoded.coverage_amount,
        coverages: (p as Record<string, unknown>).insurance_policy_coverages as
          | { coverage_type: string; coverage_amount: number }[]
          | undefined,
      }
    })
    const incomeByProfile = new Map(
      (incomeRes.data ?? []).map((r) => [
        r.profile_id,
        decodeIncomeConfigPii(r).annual_salary ?? 0,
      ]),
    )
    const benchmarksByProfile = new Map(
      (benchmarksRes.data ?? []).map((r) => [r.profile_id, r]),
    )
    const profilesMap = new Map(
      (profilesRes.data ?? []).map((r) => {
        const decoded = decodeProfilePii(r)
        return [
          r.id,
          {
            ...r,
            name: decoded.name ?? r.name,
            birth_year: decoded.birth_year ?? r.birth_year,
          },
        ]
      }),
    )

    const profileAnalyses = profileIds.map((pid) => {
      const profile = profilesMap.get(pid)
      const profilePolicies = policies.filter((p) => p.profile_id === pid)
      const annualSalary = incomeByProfile.get(pid) ?? 0
      const bench = benchmarksByProfile.get(pid)

      const customBenchmarks: CoverageBenchmarks | undefined = bench
        ? {
            deathTarget: bench.death_coverage_target ?? undefined,
            ciTarget: bench.ci_coverage_target ?? undefined,
            hospitalizationCoverage:
              bench.hospitalization_coverage ?? undefined,
            tpdTarget: bench.tpd_coverage_target ?? undefined,
            longTermCareMonthlyTarget:
              bench.long_term_care_monthly_target ?? undefined,
          }
        : undefined

      const lifeStage: LifeStageParams = {
        maritalStatus: (profile as Record<string, unknown>)?.marital_status as string | null ?? null,
        numDependents: (profile as Record<string, unknown>)?.num_dependents as number | null ?? null,
        age: profile?.birth_year ? getAge(profile.birth_year, new Date().getFullYear()) : null,
      }

      const items = calculateCoverageGap(
        profilePolicies,
        annualSalary,
        customBenchmarks,
        lifeStage,
      )

      const multipliers = getLifeStageMultipliers(lifeStage)

      return {
        profileId: pid,
        profileName: profile?.name ?? "Unknown",
        annualSalary,
        items,
        overallScore: calculateOverallScore(items),
        lifeStageLabel: multipliers.label,
      }
    })

    const combined = combineItems(profileAnalyses)

    const result: HouseholdCoverageAnalysis = {
      profiles: profileAnalyses,
      combined,
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error("[api/insurance/coverage] Error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}

function combineItems(
  profiles: HouseholdCoverageAnalysis["profiles"],
): HouseholdCoverageAnalysis["combined"] {
  if (profiles.length === 0) return []
  if (profiles.length === 1) return profiles[0].items

  const coverageTypes = profiles[0].items.map((i) => i.coverageType)

  return coverageTypes.map((ct) => {
    const perProfile = profiles.map(
      (p) => p.items.find((i) => i.coverageType === ct)!,
    )

    if (ct === "hospitalization") {
      const allCovered = perProfile.every((i) => i.hasCoverage)
      const anyCovered = perProfile.some((i) => i.hasCoverage)
      return {
        coverageType: ct,
        label: perProfile[0].label,
        held: anyCovered ? 1 : 0,
        needed: 1,
        gap: allCovered ? 0 : 1,
        gapPct: allCovered ? 0 : 100,
        hasCoverage: anyCovered,
      }
    }

    const totalHeld = perProfile.reduce((s, i) => s + i.held, 0)
    const totalNeeded = perProfile.reduce((s, i) => s + i.needed, 0)
    const totalGap = Math.max(totalNeeded - totalHeld, 0)
    const gapPct = totalNeeded > 0 ? (totalGap / totalNeeded) * 100 : 0

    return {
      coverageType: ct,
      label: perProfile[0].label,
      held: totalHeld,
      needed: totalNeeded,
      gap: totalGap,
      gapPct,
      hasCoverage: totalHeld > 0,
    }
  })
}
