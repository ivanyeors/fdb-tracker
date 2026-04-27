/**
 * Pure helpers for displaying persisted `IlpFundReportSnapshot` (fund report import).
 */

import type {
  IlpFundReportSnapshot,
  PerformanceTable,
  SectorBreakdownRow,
} from "@/lib/ilp-import/types"

/** Preferred order for key facts (matches Tokio/Morningstar-style labels). */
const HEADER_PRIORITY: readonly string[] = [
  "Latest NAV",
  "Date of Latest NAV",
  "ISIN",
  "Currency",
  "Total Net Assets",
  "totalAssetsMonthEndWithDate",
  "Fund / Benchmark",
  "fundBenchmark",
  "Morningstar Category",
  "mstarCategory",
]

export type DonutSliceRow = {
  name: string
  value: number
  percentage: number
}

export type AssetAllocationBarRow = {
  label: string
  fundPct: number | null
  categoryPct: number | null
}

export type AnnualPerformancePoint = {
  period: string
  value: number
}

/** Category / regional proxy from imported fund report header (for group donut bucketing). */
export function morningstarCategoryFromSnapshot(
  raw: Record<string, unknown> | null | undefined
): string | null {
  const s = parseFundReportSnapshot(raw ?? null)
  if (!s?.header) return null
  const h = s.header
  const direct =
    h["Morningstar Category"] ?? h["mstarCategory"] ?? h["Morningstar category"]
  if (typeof direct === "string" && direct.trim().length > 0)
    return direct.trim()
  const hit = Object.entries(h).find(([key]) => /morningstar/i.test(key))
  if (hit && typeof hit[1] === "string" && hit[1].trim().length > 0)
    return hit[1].trim()
  return null
}

export function parseFundReportSnapshot(
  raw: Record<string, unknown> | null | undefined | string,
): IlpFundReportSnapshot | null {
  if (raw == null) return null
  let o: Record<string, unknown>
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== "object") return null
      o = parsed as Record<string, unknown>
    } catch {
      return null
    }
  } else if (typeof raw === "object") {
    o = raw
  } else {
    return null
  }
  const v = Number(o.version)
  const versionOk = v === 1 || v === 2
  if (!versionOk) return null
  if (typeof o.header !== "object" || o.header === null) {
    if (!Array.isArray(o.topHoldings) || o.topHoldings.length === 0) return null
    o = { ...o, header: {} }
  }
  return o as unknown as IlpFundReportSnapshot
}

/** Parse a table cell that may contain %, unicode minus, em dash, commas. */
export function parsePercentCell(
  raw: string | null | undefined
): number | null {
  if (raw == null) return null
  const t = raw
    .replaceAll(/\u2212/g, "-")
    .replaceAll(/[−–]/g, "-")
    .replaceAll(/,/g, "")
    .replaceAll(/%/g, "")
    .trim()
  if (t === "" || t === "—" || t === "-" || /^n\/?a$/i.test(t)) return null
  const n = Number.parseFloat(t)
  return Number.isFinite(n) ? n : null
}

export function annualPerformanceToSeries(
  annual: IlpFundReportSnapshot["annualPerformance"]
): AnnualPerformancePoint[] {
  if (!annual?.periodLabels?.length) return []
  const out: AnnualPerformancePoint[] = []
  for (let i = 0; i < annual.periodLabels.length; i++) {
    const period = annual.periodLabels[i]?.trim() ?? ""
    const raw = annual.fundValues[i]
    const v = typeof raw === "string" ? parsePercentCell(raw) : null
    if (v != null && period.length > 0) out.push({ period, value: v })
  }
  return out
}

/** Raw table rows for fallback when chart has no numeric parse. */
export function annualPerformanceRawRows(
  annual: IlpFundReportSnapshot["annualPerformance"]
): { period: string; value: string }[] {
  if (!annual?.periodLabels?.length) return []
  const out: { period: string; value: string }[] = []
  for (let i = 0; i < annual.periodLabels.length; i++) {
    const period = annual.periodLabels[i]?.trim() ?? ""
    const raw = annual.fundValues[i]
    const cell = raw != null && raw.length > 0 ? raw : "—"
    if (period.length > 0) out.push({ period, value: cell })
  }
  return out
}

export function snapshotHeaderEntries(
  header: Record<string, string>
): { key: string; value: string }[] {
  const keys = Object.keys(header)
  const priority = HEADER_PRIORITY.filter((k) => keys.includes(k))
  const rest = keys
    .filter((k) => !HEADER_PRIORITY.includes(k))
    .sort((a, b) => a.localeCompare(b))
  const ordered = [...priority, ...rest]
  return ordered.map((k) => ({ key: k, value: header[k] }))
}

/** Rows for donut (fund weights only). */
export function assetAllocationToDonutRows(
  assetAllocation: IlpFundReportSnapshot["assetAllocation"]
): DonutSliceRow[] {
  if (!Array.isArray(assetAllocation) || assetAllocation.length === 0) return []
  const total = assetAllocation.reduce((sum, r) => {
    const w = r.weightPct
    return (
      sum + (typeof w === "number" && Number.isFinite(w) ? Math.max(0, w) : 0)
    )
  }, 0)
  if (total <= 0) return []
  return assetAllocation
    .map((r) => {
      const w =
        typeof r.weightPct === "number" && Number.isFinite(r.weightPct)
          ? Math.max(0, r.weightPct)
          : 0
      return {
        name: r.label,
        value: w,
        percentage: total > 0 ? (w / total) * 100 : 0,
      }
    })
    .filter((d) => d.value > 0)
}

/** Donut from Morningstar category / benchmark mix (replaces geography map in our UI). */
export function assetAllocationToCategoryDonutRows(
  assetAllocation: IlpFundReportSnapshot["assetAllocation"],
): DonutSliceRow[] {
  if (!Array.isArray(assetAllocation) || assetAllocation.length === 0) return []
  const total = assetAllocation.reduce((sum, r) => {
    const w = r.categoryPct
    return (
      sum +
      (typeof w === "number" && Number.isFinite(w) ? Math.max(0, w) : 0)
    )
  }, 0)
  if (total <= 0) return []
  return assetAllocation
    .map((r) => {
      const w =
        typeof r.categoryPct === "number" && Number.isFinite(r.categoryPct)
          ? Math.max(0, r.categoryPct)
          : 0
      return {
        name: r.label,
        value: w,
        percentage: total > 0 ? (w / total) * 100 : 0,
      }
    })
    .filter((d) => d.value > 0)
}

export function assetAllocationToBarRows(
  assetAllocation: IlpFundReportSnapshot["assetAllocation"]
): AssetAllocationBarRow[] {
  if (!Array.isArray(assetAllocation)) return []
  return assetAllocation.map((r) => ({
    label: r.label,
    fundPct:
      typeof r.weightPct === "number" && Number.isFinite(r.weightPct)
        ? r.weightPct
        : null,
    categoryPct:
      typeof r.categoryPct === "number" && Number.isFinite(r.categoryPct)
        ? r.categoryPct
        : null,
  }))
}

export function hasAnyCategoryPct(rows: AssetAllocationBarRow[]): boolean {
  return rows.some((r) => r.categoryPct != null)
}

// --- Version 2 helpers ---

/** Multi-series performance point for fund vs benchmark vs category charts. */
export type PerformanceSeriesPoint = {
  period: string
  fund: number | null
  benchmark: number | null
  category: number | null
}

/** Convert a PerformanceTable to a multi-series array for chart rendering. */
export function performanceTableToSeries(
  table: PerformanceTable | undefined,
): PerformanceSeriesPoint[] {
  if (!table?.periodLabels?.length) return []
  return table.periodLabels.map((label, i) => ({
    period: label.trim(),
    fund: parsePercentCell(table.fundValues[i] ?? null),
    benchmark: parsePercentCell(table.benchmarkValues?.[i] ?? null),
    category: parsePercentCell(table.categoryValues?.[i] ?? null),
  }))
}

/** Convert sector breakdown to donut rows. */
export function sectorBreakdownToDonutRows(
  sectors: SectorBreakdownRow[] | undefined,
): DonutSliceRow[] {
  if (!sectors || sectors.length === 0) return []
  const total = sectors.reduce((sum, r) => sum + r.weightPct, 0)
  if (total <= 0) return []
  return sectors.map((r) => ({
    name: r.sector,
    value: r.weightPct,
    percentage: (r.weightPct / total) * 100,
  }))
}

/** Style box labels for the 3×3 grid (row-major: large→small, value→growth). */
export const STYLE_BOX_LABELS = [
  "Large Value",
  "Large Blend",
  "Large Growth",
  "Mid Value",
  "Mid Blend",
  "Mid Growth",
  "Small Value",
  "Small Blend",
  "Small Growth",
] as const

/** Key-value entries for stats/fees/risk display. */
export type KeyValueEntry = { label: string; value: string }

export function stockStatsToEntries(
  stats: IlpFundReportSnapshot["stockStats"],
): KeyValueEntry[] {
  if (!stats) return []
  const entries: KeyValueEntry[] = []
  if (stats.peRatio != null) entries.push({ label: "P/E Ratio", value: stats.peRatio.toFixed(2) })
  if (stats.pbRatio != null) entries.push({ label: "P/B Ratio", value: stats.pbRatio.toFixed(2) })
  if (stats.dividendYield != null)
    entries.push({ label: "Dividend Yield", value: `${stats.dividendYield.toFixed(2)}%` })
  return entries
}

export function feesToEntries(
  fees: IlpFundReportSnapshot["fees"],
): KeyValueEntry[] {
  if (!fees) return []
  const entries: KeyValueEntry[] = []
  if (fees.expenseRatio != null)
    entries.push({ label: "Expense Ratio", value: `${fees.expenseRatio.toFixed(2)}%` })
  if (fees.managementFee != null)
    entries.push({ label: "Management Fee", value: `${fees.managementFee.toFixed(2)}%` })
  return entries
}

export function riskMeasuresToEntries(
  measures: IlpFundReportSnapshot["riskMeasures"],
): KeyValueEntry[] {
  if (!measures) return []
  const entries: KeyValueEntry[] = []
  if (measures.standardDeviation != null)
    entries.push({ label: "Std Deviation", value: measures.standardDeviation.toFixed(2) })
  if (measures.sharpeRatio != null)
    entries.push({ label: "Sharpe Ratio", value: measures.sharpeRatio.toFixed(2) })
  if (measures.alpha != null)
    entries.push({ label: "Alpha", value: measures.alpha.toFixed(2) })
  if (measures.beta != null)
    entries.push({ label: "Beta", value: measures.beta.toFixed(2) })
  return entries
}
