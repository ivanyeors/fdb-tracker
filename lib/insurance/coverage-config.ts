/**
 * Insurance policy type and coverage configuration.
 * Used for dynamic form fields, labels, and gap analysis.
 */

export const INSURANCE_TYPES = [
  "term_life",
  "whole_life",
  "integrated_shield",
  "critical_illness",
  "endowment",
  "ilp",
  "personal_accident",
] as const

export type InsuranceType = (typeof INSURANCE_TYPES)[number]

export const COVERAGE_TYPES = [
  "death",
  "critical_illness",
  "hospitalization",
  "disability",
  "personal_accident",
] as const

export type CoverageType = (typeof COVERAGE_TYPES)[number]

export const COVERAGE_TYPE_BY_POLICY: Record<InsuranceType, CoverageType | null> = {
  term_life: "death",
  whole_life: "death",
  integrated_shield: "hospitalization",
  critical_illness: "critical_illness",
  endowment: "death",
  ilp: "death",
  personal_accident: "personal_accident",
}

export function getCoverageType(type: InsuranceType): CoverageType | null {
  return COVERAGE_TYPE_BY_POLICY[type] ?? null
}

export function getCoverageLabel(type: InsuranceType): string {
  const labels: Record<InsuranceType, string> = {
    term_life: "Death benefit (sum assured)",
    whole_life: "Death benefit (sum assured)",
    integrated_shield: "Annual limit (optional)",
    critical_illness: "Lump sum payout",
    endowment: "Sum assured / maturity amount",
    ilp: "Death benefit (optional)",
    personal_accident: "Sum assured",
  }
  return labels[type] ?? "Coverage amount"
}

export function getCurrentAmountLabel(type: InsuranceType): string {
  if (type === "ilp") return "Fund value"
  if (type === "whole_life" || type === "endowment") return "Cash value"
  return "Current amount"
}

export function getEndDateLabel(type: InsuranceType): string {
  if (type === "endowment") return "Maturity date"
  if (type === "ilp") return "Premium end date"
  return "End date"
}

export interface FieldsForType {
  showCoverageAmount: boolean
  showCurrentAmount: boolean
  showEndDate: boolean
  showYearlyOutflowDate: boolean
  coverageAmountLabel: string
  currentAmountLabel: string
  endDateLabel: string
}

export function getFieldsForType(
  type: InsuranceType,
  frequency: "monthly" | "yearly" = "yearly",
): FieldsForType {
  const showCurrentAmount =
    type === "whole_life" || type === "endowment" || type === "ilp"
  const showEndDate = type === "endowment" || type === "ilp"
  const showYearlyOutflowDate = type !== "ilp" && frequency === "yearly"

  return {
    showCoverageAmount: true,
    showCurrentAmount,
    showEndDate,
    showYearlyOutflowDate,
    coverageAmountLabel: getCoverageLabel(type),
    currentAmountLabel: getCurrentAmountLabel(type),
    endDateLabel: getEndDateLabel(type),
  }
}
