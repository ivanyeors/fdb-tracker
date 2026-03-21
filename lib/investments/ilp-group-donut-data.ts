import type { IlpFundReportSnapshot, IlpTopHoldingRow } from "@/lib/ilp-import/types"
import {
  morningstarCategoryFromSnapshot,
  parseFundReportSnapshot,
  type DonutSliceRow,
} from "@/lib/investments/ilp-snapshot-ui"

export type IlpGroupMemberForDonut = {
  name: string
  fundValue: number
  fundReportSnapshot?: Record<string, unknown> | null
}

export type IlpGroupAllocationMode =
  | "category"
  | "blend"
  | "holdings"
  | "sector"

const OTHER_LABEL = "Other"
const UNCLASSIFIED_SECTOR = "Unclassified"

function snapshotOrNull(
  raw: Record<string, unknown> | null | undefined | string,
): IlpFundReportSnapshot | null {
  return parseFundReportSnapshot(raw ?? null)
}

function mergeTopNWithOther(
  rows: DonutSliceRow[],
  topN: number,
  otherLabel: string,
): DonutSliceRow[] {
  if (rows.length === 0) return []
  const sorted = [...rows].sort((a, b) => b.value - a.value)
  if (sorted.length <= topN) {
    const total = sorted.reduce((s, r) => s + r.value, 0)
    return sorted.map((r) => ({
      ...r,
      percentage: total > 0 ? (r.value / total) * 100 : 0,
    }))
  }
  const head = sorted.slice(0, topN)
  const tail = sorted.slice(topN)
  const otherValue = tail.reduce((s, r) => s + r.value, 0)
  const merged: DonutSliceRow[] = [...head]
  if (otherValue > 0) {
    merged.push({
      name: otherLabel,
      value: otherValue,
      percentage: 0,
    })
  }
  const total = merged.reduce((s, r) => s + r.value, 0)
  return merged.map((r) => ({
    ...r,
    percentage: total > 0 ? (r.value / total) * 100 : 0,
  }))
}

/**
 * Donut slices for a fund group: bucket by Morningstar category when present on a fund’s
 * latest snapshot; otherwise use the fund name. Sums values per bucket, percentages within group.
 */
export function allocationSlicesForIlpGroup(
  members: readonly IlpGroupMemberForDonut[],
): DonutSliceRow[] {
  const positive = members.filter((m) => m.fundValue > 0)
  if (positive.length === 0) return []

  const buckets = new Map<string, number>()
  for (const m of positive) {
    const cat = morningstarCategoryFromSnapshot(m.fundReportSnapshot ?? null)
    const key = cat ?? m.name
    buckets.set(key, (buckets.get(key) ?? 0) + m.fundValue)
  }

  const total = [...buckets.values()].reduce((s, v) => s + v, 0)
  return [...buckets.entries()]
    .map(([name, value]) => ({
      name,
      value,
      percentage: total > 0 ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)
}

export function groupUsesCategoryBuckets(
  members: readonly IlpGroupMemberForDonut[],
): boolean {
  return members.some(
    (m) =>
      m.fundValue > 0 &&
      morningstarCategoryFromSnapshot(m.fundReportSnapshot ?? null) != null,
  )
}

/** Weight each fund’s asset-allocation rows by fund value in the group; merge by row label. */
export function blendedFundMixSlicesForIlpGroup(
  members: readonly IlpGroupMemberForDonut[],
  options?: { topN?: number; otherLabel?: string },
): DonutSliceRow[] | null {
  const topN = options?.topN ?? 10
  const otherLabel = options?.otherLabel ?? OTHER_LABEL
  const positive = members.filter((m) => m.fundValue > 0)
  if (positive.length === 0) return null

  const buckets = new Map<string, number>()
  let any = false
  for (const m of positive) {
    const s = snapshotOrNull(m.fundReportSnapshot ?? null)
    const rows = s?.assetAllocation
    if (!Array.isArray(rows) || rows.length === 0) continue
    for (const r of rows) {
      const w =
        typeof r.weightPct === "number" && Number.isFinite(r.weightPct)
          ? Math.max(0, r.weightPct)
          : 0
      if (w <= 0) continue
      const contrib = m.fundValue * (w / 100)
      const label = r.label.trim() || "Unknown"
      buckets.set(label, (buckets.get(label) ?? 0) + contrib)
      any = true
    }
  }
  if (!any) return null

  const total = [...buckets.values()].reduce((s, v) => s + v, 0)
  const base: DonutSliceRow[] = [...buckets.entries()]
    .map(([name, value]) => ({
      name,
      value,
      percentage: total > 0 ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)
  return mergeTopNWithOther(base, topN, otherLabel)
}

/** DB/JSON sometimes stores % as string; group math must still work. */
function holdingWeightPctFromRow(row: {
  weightPct?: unknown
}): number | null {
  const w = row.weightPct
  if (typeof w === "number" && Number.isFinite(w)) return Math.max(0, w)
  if (typeof w === "string") {
    const n = parseFloat(
      w.replace(/,/g, "").replace(/%/g, "").replace(/\u2212/g, "-").trim(),
    )
    return Number.isFinite(n) ? Math.max(0, n) : null
  }
  return null
}

function topHoldingsFromSnapshot(
  raw: Record<string, unknown> | null | undefined | string,
): IlpTopHoldingRow[] | null {
  if (raw == null) return null
  let record: Record<string, unknown>
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== "object") return null
      record = parsed as Record<string, unknown>
    } catch {
      return null
    }
  } else if (typeof raw === "object") {
    record = raw
  } else {
    return null
  }
  const s = snapshotOrNull(record)
  const fromParsed = s?.topHoldings
  if (Array.isArray(fromParsed) && fromParsed.length > 0) return fromParsed
  const direct = record.topHoldings
  if (Array.isArray(direct) && direct.length > 0) {
    return direct as IlpTopHoldingRow[]
  }
  return null
}

/** Dollar weight of each security across the group (merged by name); top N + Other. */
export function groupTopHoldingsSlicesForIlpGroup(
  members: readonly IlpGroupMemberForDonut[],
  options?: { topN?: number; otherLabel?: string },
): DonutSliceRow[] | null {
  const topN = options?.topN ?? 10
  const otherLabel = options?.otherLabel ?? OTHER_LABEL
  const positive = members.filter((m) => m.fundValue > 0)
  if (positive.length === 0) return null

  const buckets = new Map<string, number>()
  let any = false
  for (const m of positive) {
    const rows = topHoldingsFromSnapshot(m.fundReportSnapshot ?? null)
    if (!rows) continue
    for (const row of rows) {
      const w = holdingWeightPctFromRow(row) ?? 0
      if (w <= 0) continue
      const name = row.securityName.trim()
      if (!name) continue
      const contrib = m.fundValue * (w / 100)
      buckets.set(name, (buckets.get(name) ?? 0) + contrib)
      any = true
    }
  }
  if (!any) return null

  const total = [...buckets.values()].reduce((s, v) => s + v, 0)
  const base: DonutSliceRow[] = [...buckets.entries()]
    .map(([name, value]) => ({
      name,
      value,
      percentage: total > 0 ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)
  return mergeTopNWithOther(base, topN, otherLabel)
}

/** Aggregate holdings by sector (reported per line); rows without sector go to Unclassified. */
export function groupSectorSlicesFromHoldings(
  members: readonly IlpGroupMemberForDonut[],
  options?: { topN?: number; otherLabel?: string; unclassifiedLabel?: string },
): DonutSliceRow[] | null {
  const topN = options?.topN ?? 10
  const otherLabel = options?.otherLabel ?? OTHER_LABEL
  const unclassified = options?.unclassifiedLabel ?? UNCLASSIFIED_SECTOR
  const positive = members.filter((m) => m.fundValue > 0)
  if (positive.length === 0) return null

  const buckets = new Map<string, number>()
  let any = false
  for (const m of positive) {
    const rows = topHoldingsFromSnapshot(m.fundReportSnapshot ?? null)
    if (!rows) continue
    for (const row of rows) {
      const w = holdingWeightPctFromRow(row) ?? 0
      if (w <= 0) continue
      const sector = row.sector?.trim()
      const key = sector && sector.length > 0 ? sector : unclassified
      buckets.set(key, (buckets.get(key) ?? 0) + m.fundValue * (w / 100))
      any = true
    }
  }
  if (!any) return null

  const total = [...buckets.values()].reduce((s, v) => s + v, 0)
  const base: DonutSliceRow[] = [...buckets.entries()]
    .map(([name, value]) => ({
      name,
      value,
      percentage: total > 0 ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)
  return mergeTopNWithOther(base, topN, otherLabel)
}

export function groupHasBlendableAssetAllocation(
  members: readonly IlpGroupMemberForDonut[],
): boolean {
  return blendedFundMixSlicesForIlpGroup(members) != null
}

export function groupHasHoldingsSlices(
  members: readonly IlpGroupMemberForDonut[],
): boolean {
  return groupTopHoldingsSlicesForIlpGroup(members) != null
}

export function groupHasSectorSlices(
  members: readonly IlpGroupMemberForDonut[],
): boolean {
  return groupSectorSlicesFromHoldings(members) != null
}

export function availableIlpGroupAllocationModes(
  members: readonly IlpGroupMemberForDonut[],
): { mode: IlpGroupAllocationMode; label: string }[] {
  /** Prefer company-level views first; “category” is the single Morningstar label per fund (header), not holdings. */
  const out: { mode: IlpGroupAllocationMode; label: string }[] = []
  if (groupHasHoldingsSlices(members)) {
    out.push({ mode: "holdings", label: "companies" })
  }
  if (groupHasSectorSlices(members)) {
    out.push({ mode: "sector", label: "By sector" })
  }
  if (groupHasBlendableAssetAllocation(members)) {
    out.push({ mode: "blend", label: "Blended fund mix" })
  }
  out.push({
    mode: "category",
    label: "Fund category",
  })
  return out
}

export function defaultIlpGroupAllocationMode(
  members: readonly IlpGroupMemberForDonut[],
): IlpGroupAllocationMode {
  if (groupHasHoldingsSlices(members)) return "holdings"
  if (groupHasBlendableAssetAllocation(members)) return "blend"
  return "category"
}

/**
 * Mode for compact ILP group summary cards (no tab strip): prefer merged holdings
 * when imports support it; otherwise same fallback order as the full panel.
 */
export function allocationModeForGroupSummaryCard(
  members: readonly IlpGroupMemberForDonut[],
): IlpGroupAllocationMode {
  if (groupHasHoldingsSlices(members)) return "holdings"
  return defaultIlpGroupAllocationMode(members)
}

export function allocationSlicesForIlpGroupMode(
  members: readonly IlpGroupMemberForDonut[],
  mode: IlpGroupAllocationMode,
): DonutSliceRow[] {
  switch (mode) {
    case "category":
      return allocationSlicesForIlpGroup(members)
    case "blend":
      return blendedFundMixSlicesForIlpGroup(members) ?? allocationSlicesForIlpGroup(members)
    case "holdings":
      return (
        groupTopHoldingsSlicesForIlpGroup(members) ?? allocationSlicesForIlpGroup(members)
      )
    case "sector":
      return (
        groupSectorSlicesFromHoldings(members) ?? allocationSlicesForIlpGroup(members)
      )
    default:
      return allocationSlicesForIlpGroup(members)
  }
}

export function subtitleForIlpGroupAllocationMode(
  mode: IlpGroupAllocationMode,
): string {
  switch (mode) {
    case "category":
      return "Each fund’s Morningstar category from the report header (fund-level label, not stock holdings)."
    case "blend":
      return "Blended asset mix from latest reports (by fund weight in group)"
    case "holdings":
      return "Company names from each fund’s portfolio table, merged across the group; largest weights shown, rest as Other."
    case "sector":
      return "Same as companies, grouped by sector column when the report lists it."
    default:
      return "Allocation"
  }
}

export function subtitleForGroupSummaryCard(
  members: readonly IlpGroupMemberForDonut[],
): string {
  const mode = allocationModeForGroupSummaryCard(members)
  if (mode === "holdings") {
    return "Merged by company across funds in this group; largest weights shown, rest as Other."
  }
  return subtitleForIlpGroupAllocationMode(mode)
}
