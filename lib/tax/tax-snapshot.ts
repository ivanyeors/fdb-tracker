import type { ProgressiveBracketBand } from "@/lib/calculations/tax"

/** Serializable tax breakdown returned from GET /api/tax for a profile and YA */
export type TaxSnapshot = {
  year: number
  employmentIncome: number
  totalReliefs: number
  reliefsRawTotal: number
  reliefCapHeadroom: number
  chargeableIncome: number
  taxBeforeRebate: number
  rebateAmount: number
  taxPayable: number
  effectiveRate: number
  marginalRate: number
  marginalBandFrom: number
  marginalBandTo: number | null
  bracketAllocation: ProgressiveBracketBand[]
}
