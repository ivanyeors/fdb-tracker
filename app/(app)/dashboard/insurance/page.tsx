import { cookies } from "next/headers"
import { getSessionFromCookies } from "@/lib/auth/session"
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
import {
  InsuranceClient,
  type InsuranceInitialData,
} from "./insurance-client"

const EMPTY: InsuranceInitialData = {
  policies: [],
  coverage: null,
}

export default async function InsurancePage() {
  const cookieStore = await cookies()
  const accountId = await getSessionFromCookies(cookieStore)
  if (!accountId) return <InsuranceClient initialData={EMPTY} />

  const familyId = cookieStore.get("fdb-active-family-id")?.value ?? null
  const profileId = cookieStore.get("fdb-active-profile-id")?.value ?? null

  if (!familyId && !profileId) return <InsuranceClient initialData={EMPTY} />

  const supabase = createSupabaseAdmin()
  const resolved = await resolveFamilyAndProfiles(
    supabase,
    accountId,
    profileId,
    familyId
  )
  if (!resolved) return <InsuranceClient initialData={EMPTY} />

  const { profileIds } = resolved

  let data: InsuranceInitialData = EMPTY

  try {
    // Fetch policies and coverage data in parallel
    const [policiesRes, activePoliciesRes, incomeRes, benchmarksRes, profilesRes] =
      await Promise.all([
        // All policies (for the policies list)
        supabase
          .from("insurance_policies")
          .select(
            "*, insurance_policy_coverages(id, coverage_type, coverage_amount, benefit_name, benefit_premium, renewal_bonus, benefit_expiry_date, benefit_unit, sort_order)"
          )
          .in("profile_id", profileIds)
          .order("created_at", { ascending: true }),
        // Active policies only (for coverage calculations)
        supabase
          .from("insurance_policies")
          .select(
            "id, profile_id, name, type, coverage_type, coverage_amount, is_active, premium_amount, frequency, yearly_outflow_date, insurance_policy_coverages(coverage_type, coverage_amount)"
          )
          .in("profile_id", profileIds)
          .eq("is_active", true),
        supabase
          .from("income_config")
          .select("profile_id, annual_salary")
          .in("profile_id", profileIds),
        supabase
          .from("insurance_coverage_benchmarks")
          .select(
            "profile_id, death_coverage_target, ci_coverage_target, hospitalization_coverage, tpd_coverage_target, long_term_care_monthly_target"
          )
          .in("profile_id", profileIds),
        supabase
          .from("profiles")
          .select(
            "id, name, name_enc, birth_year, birth_year_enc, marital_status, num_dependents",
          )
          .in("id", profileIds),
      ])

    // Map policies for the client list
    const policies = (policiesRes.data ?? []).map((p) => ({
      ...p,
      coverages: p.insurance_policy_coverages ?? [],
      insurance_policy_coverages: undefined,
    }))

    // Build coverage analysis (mirrors /api/insurance/coverage logic)
    const activePolicies = (activePoliciesRes.data ?? []).map((p) => ({
      ...p,
      coverages: (p as Record<string, unknown>).insurance_policy_coverages as
        | { coverage_type: string; coverage_amount: number }[]
        | undefined,
    }))
    const incomeByProfile = new Map(
      (incomeRes.data ?? []).map((r) => [r.profile_id, r.annual_salary ?? 0])
    )
    const benchmarksByProfile = new Map(
      (benchmarksRes.data ?? []).map((r) => [r.profile_id, r])
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
      })
    )

    const profileAnalyses = profileIds.map((pid) => {
      const profile = profilesMap.get(pid)
      const profilePolicies = activePolicies.filter(
        (p) => p.profile_id === pid
      )
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
        maritalStatus:
          ((profile as Record<string, unknown>)?.marital_status as
            | string
            | null) ?? null,
        numDependents:
          ((profile as Record<string, unknown>)?.num_dependents as
            | number
            | null) ?? null,
        age: profile?.birth_year
          ? getAge(profile.birth_year, new Date().getFullYear())
          : null,
      }

      const items = calculateCoverageGap(
        profilePolicies,
        annualSalary,
        customBenchmarks,
        lifeStage
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

    const coverage: HouseholdCoverageAnalysis = {
      profiles: profileAnalyses,
      combined,
    }

    data = { policies, coverage }
  } catch {
    // fall through with empty data
  }

  return <InsuranceClient initialData={data} />
}

/** Combine coverage items across profiles (same logic as coverage API route) */
function combineItems(
  profiles: HouseholdCoverageAnalysis["profiles"]
): HouseholdCoverageAnalysis["combined"] {
  if (profiles.length === 0) return []
  if (profiles.length === 1) return profiles[0].items

  const coverageTypes = profiles[0].items.map((i) => i.coverageType)

  return coverageTypes.map((ct) => {
    const perProfile = profiles.map(
      (p) => p.items.find((i) => i.coverageType === ct)!
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
