/**
 * Typed output from Tokio Marine + Morningstar fund report MHTML parsing.
 */

export type IlpFundReportParserId = "tokio-morningstar-v1"

/** One row from Morningstar “Portfolio holdings” / top holdings table (0–10+ rows in source). */
export type IlpTopHoldingRow = {
  rank: number | null
  securityName: string
  /** Industry sector when present; often “—” in source for some names. */
  sector: string | null
  country: string | null
  /** Weight as % of fund assets (same basis as report table). */
  weightPct: number | null
}

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
  /** Parsed from `mstar-component-id="topTenHoldingsTable"` when present (variable row count). */
  topHoldings?: IlpTopHoldingRow[]
  warnings: string[]
}

export interface IlpFundReportParseResult {
  snapshot: IlpFundReportSnapshot
  /** Suggested statement month YYYY-MM-01 from latest NAV date if parseable */
  suggestedMonth: string | null
  /** Parsed latest NAV as number when possible */
  latestNavNumeric: number | null
}
