/**
 * Insurance policy type and coverage configuration.
 * Used for dynamic form fields, labels, and gap analysis.
 *
 * Note: `ilp` is no longer a creatable insurance type (use Investments / ilp_products).
 * Legacy rows may still have type "ilp" in the database — use getFieldsForInsurancePolicyRow
 * and getCoverageType (string) for those rows.
 */

export const INSURANCE_TYPES = [
  "term_life",
  "whole_life",
  "integrated_shield",
  "critical_illness",
  "endowment",
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
  personal_accident: "personal_accident",
}

/** Resolves coverage_type for inserts/updates, including legacy `insurance_policies.type = ilp`. */
export function getCoverageType(type: string): CoverageType | null {
  if (type === "ilp") return "death"
  if (type in COVERAGE_TYPE_BY_POLICY) {
    return COVERAGE_TYPE_BY_POLICY[type as InsuranceType]
  }
  return null
}

export function getCoverageLabel(type: InsuranceType): string {
  const labels: Record<InsuranceType, string> = {
    term_life: "Death benefit (sum assured)",
    whole_life: "Death benefit (sum assured)",
    integrated_shield: "Annual limit (optional)",
    critical_illness: "Lump sum payout",
    endowment: "Sum assured / maturity amount",
    personal_accident: "Sum assured",
  }
  return labels[type] ?? "Coverage amount"
}

export function getCurrentAmountLabel(type: InsuranceType): string {
  if (type === "whole_life" || type === "endowment") return "Cash value"
  return "Current amount"
}

export function getEndDateLabel(type: InsuranceType): string {
  if (type === "endowment") return "Maturity date"
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
  const showCurrentAmount = type === "whole_life" || type === "endowment"
  const showEndDate = type === "endowment"
  const showYearlyOutflowDate = frequency === "yearly"

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

/** Includes legacy `type === "ilp"` rows still stored on insurance_policies. */
export function getFieldsForInsurancePolicyRow(
  type: string,
  frequency: "monthly" | "yearly" = "yearly",
): FieldsForType {
  if (type === "ilp") {
    return {
      showCoverageAmount: true,
      showCurrentAmount: true,
      showEndDate: true,
      showYearlyOutflowDate: false,
      coverageAmountLabel: "Death benefit (optional)",
      currentAmountLabel: "Fund value",
      endDateLabel: "Premium end date",
    }
  }
  return getFieldsForType(type as InsuranceType, frequency)
}
