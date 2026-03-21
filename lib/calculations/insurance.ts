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
}

type PolicyForGap = {
  coverage_type: string | null
  coverage_amount: number | null
  is_active: boolean
  type: string
}

const COVERAGE_LABELS: Record<CoverageType, string> = {
  death: "Death / Life",
  critical_illness: "Critical Illness",
  hospitalization: "Hospitalization",
  disability: "Disability",
  personal_accident: "Personal Accident",
}

const SCORE_WEIGHTS: Record<CoverageType, number> = {
  death: 0.3,
  critical_illness: 0.25,
  hospitalization: 0.25,
  disability: 0.15,
  personal_accident: 0.05,
}

function sumCoverageByType(
  policies: PolicyForGap[],
  coverageType: CoverageType,
): number {
  return policies
    .filter((p) => p.is_active && p.coverage_type === coverageType)
    .reduce((sum, p) => sum + (p.coverage_amount || 0), 0)
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
): CoverageGapItem[] {
  const monthlySalary = annualSalary / 12

  const deathNeeded = customBenchmarks?.deathTarget ?? annualSalary * 9
  const ciNeeded = customBenchmarks?.ciTarget ?? annualSalary * 4
  const disabilityNeeded =
    customBenchmarks?.disabilityTarget ?? monthlySalary * 0.75 * 60

  const deathHeld = sumCoverageByType(policies, "death")
  const ciHeld = sumCoverageByType(policies, "critical_illness")
  const hasISP = hasActiveISP(policies)
  const disabilityHeld = sumCoverageByType(policies, "disability")
  const paHeld = sumCoverageByType(policies, "personal_accident")

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
    {
      coverageType: "hospitalization",
      label: COVERAGE_LABELS.hospitalization,
      held: hasISP ? 1 : 0,
      needed: 1,
      gap: hasISP ? 0 : 1,
      gapPct: hasISP ? 0 : 100,
      hasCoverage: hasISP,
    },
    makeItem("disability", disabilityHeld, disabilityNeeded),
    {
      coverageType: "personal_accident",
      label: COVERAGE_LABELS.personal_accident,
      held: paHeld,
      needed: 0,
      gap: 0,
      gapPct: 0,
      hasCoverage: paHeld > 0,
    },
  ]
}

export function calculateOverallScore(items: CoverageGapItem[]): number {
  let totalWeight = 0
  let weightedSum = 0

  for (const item of items) {
    const weight = SCORE_WEIGHTS[item.coverageType] ?? 0
    totalWeight += weight

    if (item.coverageType === "hospitalization") {
      weightedSum += item.hasCoverage ? weight * 100 : 0
    } else if (item.coverageType === "personal_accident") {
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
  }>,
): HouseholdCoverageAnalysis {
  const profiles: ProfileCoverageAnalysis[] = profileData.map((pd) => {
    const items = calculateCoverageGap(
      pd.policies,
      pd.annualSalary,
      pd.benchmarks,
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
    "hospitalization",
    "disability",
    "personal_accident",
  ]

  return coverageTypes.map((ct) => {
    const perProfile = profiles.map(
      (p) => p.items.find((i) => i.coverageType === ct)!,
    )

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

export function getCoverageRecommendation(item: CoverageGapItem): string | null {
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
    default:
      return null
  }
}
