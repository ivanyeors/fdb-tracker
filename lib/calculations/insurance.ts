import type { CoverageType } from "@/lib/insurance/coverage-config"

export type CoverageGapItem = {
  coverageType: CoverageType
  label: string
  held: number
  needed: number
  gap: number
  gapPct: number
  hasCoverage: boolean
}

export type ProfileCoverageAnalysis = {
  profileId: string
  profileName: string
  annualSalary: number
  items: CoverageGapItem[]
  overallScore: number
}

export type HouseholdCoverageAnalysis = {
  profiles: ProfileCoverageAnalysis[]
  combined: CoverageGapItem[]
}

export type CoverageBenchmarks = {
  deathTarget?: number
  ciTarget?: number
  hospitalizationCoverage?: string
  disabilityTarget?: number
  tpdTarget?: number
  longTermCareMonthlyTarget?: number
}

export type LifeStageParams = {
  maritalStatus?: string | null
  numDependents?: number | null
  age?: number | null
}

/**
 * Adjust coverage multipliers based on life stage.
 * - Single, no dependents: lower death (3x), maintain CI (4x)
 * - Married, no dependents: moderate death (6x), CI (4x)
 * - Married, with children: full death (9x), higher CI (5x)
 * - Nearing retirement (55+): reduce death (3x), increase hospitalization awareness
 */
export function getLifeStageMultipliers(params: LifeStageParams): {
  deathMultiplier: number
  ciMultiplier: number
  label: string
} {
  const age = params.age ?? 30
  const dependents = params.numDependents ?? 0
  const married = params.maritalStatus === "married"

  if (age >= 55) {
    return { deathMultiplier: 3, ciMultiplier: 4, label: "Pre-retirement" }
  }
  if (!married && dependents === 0) {
    return { deathMultiplier: 3, ciMultiplier: 4, label: "Single, no dependents" }
  }
  if (married && dependents === 0) {
    return { deathMultiplier: 6, ciMultiplier: 4, label: "Married, no dependents" }
  }
  if (dependents > 0) {
    return { deathMultiplier: 9, ciMultiplier: 5, label: `${dependents} dependent${dependents > 1 ? "s" : ""}` }
  }
  return { deathMultiplier: 9, ciMultiplier: 4, label: "Default" }
}

export type PolicyCoverageEntry = {
  coverage_type: string
  coverage_amount: number
}

type PolicyForGap = {
  coverage_type: string | null
  coverage_amount: number | null
  is_active: boolean
  type: string
  coverages?: PolicyCoverageEntry[]
}

const COVERAGE_LABELS: Record<CoverageType, string> = {
  death: "Death / Life",
  critical_illness: "Critical Illness",
  early_critical_illness: "Early Critical Illness",
  hospitalization: "Hospitalization",
  medical_reimbursement: "Medical Reimbursement",
  disability: "Disability Income",
  personal_accident: "Personal Accident",
  accident_death_tpd: "Accident Death/TPD",
  long_term_care: "Long-term Care",
  tpd: "Total Permanent Disability",
}

const SCORE_WEIGHTS: Record<CoverageType, number> = {
  death: 0.22,
  critical_illness: 0.17,
  early_critical_illness: 0.05,
  hospitalization: 0.18,
  medical_reimbursement: 0.03,
  disability: 0.12,
  tpd: 0.1,
  long_term_care: 0.08,
  personal_accident: 0.03,
  accident_death_tpd: 0.02,
}

function sumCoverageByType(
  policies: PolicyForGap[],
  coverageType: CoverageType,
): number {
  return policies
    .filter((p) => p.is_active)
    .reduce((sum, p) => {
      if (p.coverages && p.coverages.length > 0) {
        const match = p.coverages.find((c) => c.coverage_type === coverageType)
        return sum + (match?.coverage_amount ?? 0)
      }
      if (p.coverage_type === coverageType) {
        return sum + (p.coverage_amount || 0)
      }
      return sum
    }, 0)
}

function hasActiveISP(policies: PolicyForGap[]): boolean {
  return policies.some(
    (p) => p.is_active && p.type === "integrated_shield",
  )
}

export function calculateCoverageGap(
  policies: PolicyForGap[],
  annualSalary: number,
  customBenchmarks?: CoverageBenchmarks,
  lifeStage?: LifeStageParams,
): CoverageGapItem[] {
  const monthlySalary = annualSalary / 12
  const multipliers = lifeStage ? getLifeStageMultipliers(lifeStage) : null

  const deathNeeded = customBenchmarks?.deathTarget ?? annualSalary * (multipliers?.deathMultiplier ?? 9)
  const ciNeeded = customBenchmarks?.ciTarget ?? annualSalary * (multipliers?.ciMultiplier ?? 4)
  const disabilityNeeded =
    customBenchmarks?.disabilityTarget ?? monthlySalary * 0.75 * 60
  const tpdNeeded = customBenchmarks?.tpdTarget ?? annualSalary * 9
  // CareShield Life base is ~$600/mo; supplement needed for ~$3,600/mo total
  const ltcMonthlyNeeded =
    customBenchmarks?.longTermCareMonthlyTarget ?? 3000

  const earlyCiNeeded = ciNeeded * 0.25

  const deathHeld = sumCoverageByType(policies, "death")
  const ciHeld = sumCoverageByType(policies, "critical_illness")
  const earlyCiHeld = sumCoverageByType(policies, "early_critical_illness")
  const hasISP = hasActiveISP(policies)
  const medicalHeld = sumCoverageByType(policies, "medical_reimbursement")
  const disabilityHeld = sumCoverageByType(policies, "disability")
  const paHeld = sumCoverageByType(policies, "personal_accident")
  const accidentDtpdHeld = sumCoverageByType(policies, "accident_death_tpd")
  const tpdHeld = sumCoverageByType(policies, "tpd")
  const ltcHeld = sumCoverageByType(policies, "long_term_care")

  const makeItem = (
    coverageType: CoverageType,
    held: number,
    needed: number,
  ): CoverageGapItem => {
    const gap = Math.max(needed - held, 0)
    const gapPct = needed > 0 ? (gap / needed) * 100 : 0
    return {
      coverageType,
      label: COVERAGE_LABELS[coverageType],
      held,
      needed,
      gap,
      gapPct,
      hasCoverage: held > 0 || (coverageType === "hospitalization" && hasISP),
    }
  }

  return [
    makeItem("death", deathHeld, deathNeeded),
    makeItem("critical_illness", ciHeld, ciNeeded),
    makeItem("early_critical_illness", earlyCiHeld, earlyCiNeeded),
    {
      coverageType: "hospitalization",
      label: COVERAGE_LABELS.hospitalization,
      held: hasISP ? 1 : 0,
      needed: 1,
      gap: hasISP ? 0 : 1,
      gapPct: hasISP ? 0 : 100,
      hasCoverage: hasISP,
    },
    {
      coverageType: "medical_reimbursement",
      label: COVERAGE_LABELS.medical_reimbursement,
      held: medicalHeld,
      needed: 0,
      gap: 0,
      gapPct: 0,
      hasCoverage: medicalHeld > 0,
    },
    makeItem("disability", disabilityHeld, disabilityNeeded),
    makeItem("tpd", tpdHeld, tpdNeeded),
    makeItem("long_term_care", ltcHeld, ltcMonthlyNeeded),
    {
      coverageType: "personal_accident",
      label: COVERAGE_LABELS.personal_accident,
      held: paHeld,
      needed: 0,
      gap: 0,
      gapPct: 0,
      hasCoverage: paHeld > 0,
    },
    {
      coverageType: "accident_death_tpd",
      label: COVERAGE_LABELS.accident_death_tpd,
      held: accidentDtpdHeld,
      needed: 0,
      gap: 0,
      gapPct: 0,
      hasCoverage: accidentDtpdHeld > 0,
    },
  ]
}

export function calculateOverallScore(items: CoverageGapItem[]): number {
  let totalWeight = 0
  let weightedSum = 0

  for (const item of items) {
    const weight = SCORE_WEIGHTS[item.coverageType] ?? 0
    totalWeight += weight

    if (
      item.coverageType === "hospitalization" ||
      item.coverageType === "personal_accident" ||
      item.coverageType === "accident_death_tpd" ||
      item.coverageType === "medical_reimbursement"
    ) {
      weightedSum += item.hasCoverage ? weight * 100 : 0
    } else if (item.needed > 0) {
      const pct = Math.min(item.held / item.needed, 1) * 100
      weightedSum += weight * pct
    }
  }

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0
}

export function getHouseholdCoverage(
  profileData: Array<{
    profileId: string
    profileName: string
    annualSalary: number
    policies: PolicyForGap[]
    benchmarks?: CoverageBenchmarks
    lifeStage?: LifeStageParams
  }>,
): HouseholdCoverageAnalysis {
  const profiles: ProfileCoverageAnalysis[] = profileData.map((pd) => {
    const items = calculateCoverageGap(
      pd.policies,
      pd.annualSalary,
      pd.benchmarks,
      pd.lifeStage,
    )
    return {
      profileId: pd.profileId,
      profileName: pd.profileName,
      annualSalary: pd.annualSalary,
      items,
      overallScore: calculateOverallScore(items),
    }
  })

  const combined = combineCoverageItems(profiles)

  return { profiles, combined }
}

function combineCoverageItems(
  profiles: ProfileCoverageAnalysis[],
): CoverageGapItem[] {
  const coverageTypes: CoverageType[] = [
    "death",
    "critical_illness",
    "early_critical_illness",
    "hospitalization",
    "medical_reimbursement",
    "disability",
    "tpd",
    "long_term_care",
    "personal_accident",
    "accident_death_tpd",
  ]

  return coverageTypes.map((ct) => {
    const perProfile = profiles
      .map((p) => p.items.find((i) => i.coverageType === ct))
      .filter((i): i is CoverageGapItem => i != null)

    if (perProfile.length === 0) {
      return {
        coverageType: ct,
        label: COVERAGE_LABELS[ct],
        held: 0,
        needed: 0,
        gap: 0,
        gapPct: 0,
        hasCoverage: false,
      }
    }

    if (ct === "hospitalization") {
      const allCovered = perProfile.every((i) => i.hasCoverage)
      const anyCovered = perProfile.some((i) => i.hasCoverage)
      return {
        coverageType: ct,
        label: COVERAGE_LABELS[ct],
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
      label: COVERAGE_LABELS[ct],
      held: totalHeld,
      needed: totalNeeded,
      gap: totalGap,
      gapPct,
      hasCoverage: totalHeld > 0,
    }
  })
}

export function getCoverageRecommendation(
  item: CoverageGapItem,
): string | null {
  if (item.gapPct === 0) return null

  switch (item.coverageType) {
    case "death":
      return `Consider term life insurance for approximately $${Math.round(item.gap).toLocaleString()} to close the gap`
    case "critical_illness":
      return `Critical illness cover of $${Math.round(item.gap).toLocaleString()} recommended (4\u00d7 income benchmark)`
    case "hospitalization":
      return "Consider an Integrated Shield Plan for private hospital coverage beyond MediShield Life"
    case "disability":
      return "Income protection insurance can cover disability risk (75% salary replacement)"
    case "tpd":
      return `TPD coverage of $${Math.round(item.gap).toLocaleString()} recommended (9\u00d7 income benchmark, often bundled with life)`
    case "long_term_care":
      return `Consider supplementary long-term care coverage of $${Math.round(item.gap).toLocaleString()}/mo to supplement CareShield Life`
    case "early_critical_illness":
      return `Early critical illness cover of $${Math.round(item.gap).toLocaleString()} recommended (25% of CI benchmark for early-stage conditions)`
    default:
      return null
  }
}
