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
  "universal_life",
  "integrated_shield",
  "critical_illness",
  "early_critical_illness",
  "multi_pay_ci",
  "endowment",
  "personal_accident",
  "disability_income",
  "long_term_care",
  "tpd",
] as const

export type InsuranceType = (typeof INSURANCE_TYPES)[number]

export const COVERAGE_TYPES = [
  "death",
  "critical_illness",
  "hospitalization",
  "disability",
  "personal_accident",
  "long_term_care",
  "tpd",
] as const

export type CoverageType = (typeof COVERAGE_TYPES)[number]

export const COVERAGE_TYPE_BY_POLICY: Record<InsuranceType, CoverageType | null> = {
  term_life: "death",
  whole_life: "death",
  universal_life: "death",
  integrated_shield: "hospitalization",
  critical_illness: "critical_illness",
  early_critical_illness: "critical_illness",
  multi_pay_ci: "critical_illness",
  endowment: null,
  personal_accident: "personal_accident",
  disability_income: "disability",
  long_term_care: "long_term_care",
  tpd: "tpd",
}

/** Resolves coverage_type for inserts/updates, including legacy `insurance_policies.type = ilp`. */
export function getCoverageType(type: string): CoverageType | null {
  if (type === "ilp") return "death"
  if (type in COVERAGE_TYPE_BY_POLICY) {
    return COVERAGE_TYPE_BY_POLICY[type as InsuranceType]
  }
  return null
}

export const INSURANCE_TYPE_LABELS: Record<InsuranceType, string> = {
  term_life: "Term Life",
  whole_life: "Whole Life",
  universal_life: "Universal Life",
  integrated_shield: "Integrated Shield Plan",
  critical_illness: "Critical Illness",
  early_critical_illness: "Early Critical Illness",
  multi_pay_ci: "Multi-pay Critical Illness",
  endowment: "Endowment / Savings",
  personal_accident: "Personal Accident",
  disability_income: "Disability Income",
  long_term_care: "Long-term Care",
  tpd: "Total Permanent Disability",
}

/** ISP ward sub-types for integrated_shield policies. */
export const ISP_SUB_TYPES = [
  { value: "ward_b2_b1", label: "Ward B2/B1" },
  { value: "ward_b1", label: "Ward B1" },
  { value: "ward_a", label: "Ward A" },
  { value: "private", label: "Private" },
] as const

export function getCoverageLabel(type: InsuranceType): string {
  const labels: Record<InsuranceType, string> = {
    term_life: "Death benefit (sum assured)",
    whole_life: "Death benefit (sum assured)",
    universal_life: "Death benefit (sum assured)",
    integrated_shield: "Annual limit (optional)",
    critical_illness: "Lump sum payout",
    early_critical_illness: "Lump sum payout",
    multi_pay_ci: "Payout per claim",
    endowment: "Sum assured / maturity amount",
    personal_accident: "Sum assured",
    disability_income: "Monthly benefit",
    long_term_care: "Monthly payout",
    tpd: "Lump sum payout",
  }
  return labels[type] ?? "Coverage amount"
}

export function getCurrentAmountLabel(type: InsuranceType): string {
  if (type === "whole_life" || type === "universal_life" || type === "endowment")
    return "Cash value"
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
  showSubType: boolean
  showRider: boolean
  showMaturityValue: boolean
  showCashValue: boolean
  showCoverageTillAge: boolean
  coverageAmountLabel: string
  currentAmountLabel: string
  endDateLabel: string
}

export function getFieldsForType(
  type: InsuranceType,
  frequency: "monthly" | "yearly" = "yearly",
): FieldsForType {
  const showCurrentAmount =
    type === "whole_life" || type === "universal_life" || type === "endowment"
  const showEndDate = type === "endowment"
  const showYearlyOutflowDate = frequency === "yearly"
  const showSubType = type === "integrated_shield"
  const showRider = type === "integrated_shield"
  const showMaturityValue = type === "endowment"
  const showCashValue =
    type === "whole_life" || type === "universal_life" || type === "endowment"
  const showCoverageTillAge =
    type === "term_life" ||
    type === "critical_illness" ||
    type === "early_critical_illness" ||
    type === "multi_pay_ci" ||
    type === "tpd" ||
    type === "disability_income"

  return {
    showCoverageAmount: true,
    showCurrentAmount,
    showEndDate,
    showYearlyOutflowDate,
    showSubType,
    showRider,
    showMaturityValue,
    showCashValue,
    showCoverageTillAge,
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
      showSubType: false,
      showRider: false,
      showMaturityValue: false,
      showCashValue: false,
      showCoverageTillAge: false,
      coverageAmountLabel: "Death benefit (optional)",
      currentAmountLabel: "Fund value",
      endDateLabel: "Premium end date",
    }
  }
  return getFieldsForType(type as InsuranceType, frequency)
}
