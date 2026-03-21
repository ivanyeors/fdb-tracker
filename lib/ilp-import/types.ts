/**
 * Typed output from Tokio Marine + Morningstar fund report MHTML parsing.
 */

export type IlpFundReportParserId = "tokio-morningstar-v1"

/** Persisted shape (Option A jsonb on ilp_entries). */
export interface IlpFundReportSnapshot {
  version: 1
  parserId: IlpFundReportParserId
  /** ISO timestamp when parsing ran */
  extractedAt: string
  msId: string | null
  currencyId: string | null
  performanceCurrency: string | null
  snapshotUrl: string | null
  investmentName: string | null
  /** Normalized keys from section-id + label text */
  header: Record<string, string>
  growthChartPresent: boolean
  annualPerformanceTablePresent: boolean
  trailingReturnsTablePresent: boolean
  calendarYearReturnsPresent: boolean
  /** Column labels (periods) and Fund row values as strings (may include −, %, etc.) */
  annualPerformance?: {
    periodLabels: string[]
    fundValues: (string | null)[]
  }
  /** Broad asset class breakdown */
  assetAllocation?: Array<{
    label: string
    weightPct: number | null
    categoryPct: number | null
  }>
  warnings: string[]
}

export interface IlpFundReportParseResult {
  snapshot: IlpFundReportSnapshot
  /** Suggested statement month YYYY-MM-01 from latest NAV date if parseable */
  suggestedMonth: string | null
  /** Parsed latest NAV as number when possible */
  latestNavNumeric: number | null
}
