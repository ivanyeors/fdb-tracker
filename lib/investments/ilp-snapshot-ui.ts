/**
 * Pure helpers for displaying persisted `IlpFundReportSnapshot` (fund report import).
 */

import type { IlpFundReportSnapshot } from "@/lib/ilp-import/types"

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
  raw: Record<string, unknown> | null | undefined
): IlpFundReportSnapshot | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  if (o.version !== 1) return null
  if (typeof o.header !== "object" || o.header === null) return null
  return raw as unknown as IlpFundReportSnapshot
}

/** Parse a table cell that may contain %, unicode minus, em dash, commas. */
export function parsePercentCell(
  raw: string | null | undefined
): number | null {
  if (raw == null) return null
  const t = raw
    .replace(/\u2212/g, "-")
    .replace(/[−–]/g, "-")
    .replace(/,/g, "")
    .replace(/%/g, "")
    .trim()
  if (t === "" || t === "—" || t === "-" || /^n\/?a$/i.test(t)) return null
  const n = parseFloat(t)
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
