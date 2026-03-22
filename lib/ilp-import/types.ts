/**
 * Typed output from Tokio Marine + Morningstar fund report MHTML parsing.
 */

export type IlpFundReportParserId =
  | "tokio-morningstar-v1"
  | "tokio-morningstar-v2"

/** One row from Morningstar "Portfolio holdings" / top holdings table (0–10+ rows in source). */
export type IlpTopHoldingRow = {
  rank: number | null
  securityName: string
  /** Industry sector when present; often "—" in source for some names. */
  sector: string | null
  country: string | null
  /** Weight as % of fund assets (same basis as report table). */
  weightPct: number | null
}

/** Performance table shape shared by annual, calendar-year, and trailing returns. */
export interface PerformanceTable {
  periodLabels: string[]
  fundValues: (string | null)[]
  benchmarkValues?: (string | null)[]
  categoryValues?: (string | null)[]
}

/** Sector weight entry aggregated from holdings or dedicated section. */
export interface SectorBreakdownRow {
  sector: string
  weightPct: number
}

/** Morningstar 3×3 style box (value/blend/growth × large/mid/small). */
export interface StockStyleBox {
  /** 9-element array: [large-value, large-blend, large-growth, mid-value, mid-blend, mid-growth, small-value, small-blend, small-growth]. Each is a percentage or null. */
  grid: (number | null)[]
  /** Summary label, e.g. "Large Blend" */
  styleLabel?: string
}

/** Key fund statistics. */
export interface StockStats {
  peRatio?: number | null
  pbRatio?: number | null
  dividendYield?: number | null
}

/** Fee information from the fund report. */
export interface FundFees {
  expenseRatio?: number | null
  managementFee?: number | null
}

/** Risk measures from the fund report. */
export interface RiskMeasures {
  standardDeviation?: number | null
  sharpeRatio?: number | null
  alpha?: number | null
  beta?: number | null
}

/** Persisted shape (jsonb on ilp_entries). */
export interface IlpFundReportSnapshot {
  version: 1 | 2
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

  /** Column labels (periods) and Fund/Benchmark/Category row values as strings (may include −, %, etc.) */
  annualPerformance?: PerformanceTable
  /** Broad asset class breakdown */
  assetAllocation?: Array<{
    label: string
    weightPct: number | null
    categoryPct: number | null
  }>
  /** Parsed from `mstar-component-id="topTenHoldingsTable"` when present (variable row count). */
  topHoldings?: IlpTopHoldingRow[]

  // --- Version 2 fields (all optional for backward compat) ---

  /** Calendar year returns (e.g. 2020, 2021, 2022 …) */
  calendarYearReturns?: PerformanceTable
  /** Trailing returns: 1m, 3m, 6m, 1y, 3y, 5y, 10y */
  trailingReturns?: PerformanceTable
  /** Sector breakdown aggregated from top holdings or dedicated section */
  sectorBreakdown?: SectorBreakdownRow[]
  /** Morningstar style box */
  stockStyle?: StockStyleBox
  /** Fund statistics (P/E, P/B, dividend yield) */
  stockStats?: StockStats
  /** Fee information (expense ratio, management fee) */
  fees?: FundFees
  /** Risk measures (std dev, Sharpe, alpha, beta) */
  riskMeasures?: RiskMeasures

  warnings: string[]
}

export interface IlpFundReportParseResult {
  snapshot: IlpFundReportSnapshot
  /** Suggested statement month YYYY-MM-01 from latest NAV date if parseable */
  suggestedMonth: string | null
  /** Parsed latest NAV as number when possible */
  latestNavNumeric: number | null
}
