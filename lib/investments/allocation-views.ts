/**
 * Pure computation functions for the redesigned Allocation tab.
 * No React — all functions take data in, return derived views.
 */

import type { Holding } from "@/lib/investments/holding"
import type { IlpGroupMemberForDonut } from "@/lib/investments/ilp-group-donut-data"
import {
  groupTopHoldingsSlicesForIlpGroup,
} from "@/lib/investments/ilp-group-donut-data"
import { parseFundReportSnapshot } from "@/lib/investments/ilp-snapshot-ui"

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type AllocationData = {
  name: string
  value: number
  percentage: number
}

export type PositionRow = {
  name: string
  type: "stock" | "etf" | "bond" | "gold" | "silver" | "ilp" | "cash"
  value: number
  percentage: number
  cumulativePercentage: number
}

export type ConcentrationMetrics = {
  positionCount: number
  largestName: string
  largestPct: number
  top5Pct: number
  sgdPct: number
  usdPct: number
  ilpPct: number
}

export type IlpProductForAllocation = {
  name: string
  latestEntry: {
    fund_value: number
    fund_report_snapshot?: Record<string, unknown> | null
  } | null
  entries: {
    fund_value: number
    fund_report_snapshot?: Record<string, unknown> | null
  }[]
  fund_group_memberships?: { group_id: string; group_name: string }[]
}

// ---------------------------------------------------------------------------
// Currency helpers
// ---------------------------------------------------------------------------

function currencyForHolding(symbol: string, type: string): "SGD" | "USD" {
  if (type === "gold" || type === "silver") return "USD"
  const s = symbol.trim().toUpperCase()
  if (s.endsWith(".SI") || s.endsWith(".SG")) return "SGD"
  return "USD"
}

// ---------------------------------------------------------------------------
// Allocation by currency
// ---------------------------------------------------------------------------

export function allocationByCurrency(
  holdings: readonly Holding[],
  ilpTotalSum: number,
  cashBalance: number,
  fullPortfolioTotal: number,
): AllocationData[] {
  let sgd = 0
  let usd = 0

  for (const h of holdings) {
    const v = h.currentValue ?? 0
    if (v <= 0) continue
    if (currencyForHolding(h.symbol, h.type) === "SGD") {
      sgd += v
    } else {
      usd += v
    }
  }

  // ILP fund values are in SGD
  sgd += ilpTotalSum
  // Cash is in SGD
  if (cashBalance > 0) sgd += cashBalance

  const denom = fullPortfolioTotal > 0 ? fullPortfolioTotal : 1
  const result: AllocationData[] = []
  if (sgd > 0) result.push({ name: "SGD", value: sgd, percentage: (sgd / denom) * 100 })
  if (usd > 0) result.push({ name: "USD", value: usd, percentage: (usd / denom) * 100 })
  return result.sort((a, b) => b.value - a.value)
}

// ---------------------------------------------------------------------------
// Unified position list (for concentration table)
// ---------------------------------------------------------------------------

export function buildUnifiedPositionList(
  holdings: readonly Holding[],
  ilpProducts: readonly IlpProductForAllocation[],
  cashBalance: number,
  fullPortfolioTotal: number,
): PositionRow[] {
  const denom = fullPortfolioTotal > 0 ? fullPortfolioTotal : 1

  // Group holdings by symbol+type
  const holdingMap = new Map<string, { value: number; type: string; symbol: string }>()
  for (const h of holdings) {
    const v = h.currentValue ?? 0
    if (v <= 0) continue
    const key = `${h.type}::${h.symbol.trim().toUpperCase()}`
    const cur = holdingMap.get(key)
    if (cur) {
      cur.value += v
    } else {
      holdingMap.set(key, { value: v, type: h.type, symbol: h.symbol })
    }
  }

  const rows: Omit<PositionRow, "cumulativePercentage">[] = []

  for (const entry of holdingMap.values()) {
    const name =
      entry.type === "gold"
        ? "Gold"
        : entry.type === "silver"
          ? "Silver"
          : entry.symbol.trim().toUpperCase()
    rows.push({
      name,
      type: entry.type as PositionRow["type"],
      value: entry.value,
      percentage: (entry.value / denom) * 100,
    })
  }

  for (const p of ilpProducts) {
    const fv = p.latestEntry?.fund_value ?? 0
    if (fv <= 0) continue
    const firstGroup = p.fund_group_memberships?.[0]
    const label = firstGroup
      ? `${firstGroup.group_name} · ${p.name}`
      : p.name
    rows.push({
      name: label,
      type: "ilp",
      value: fv,
      percentage: (fv / denom) * 100,
    })
  }

  if (cashBalance > 0) {
    rows.push({
      name: "Cash",
      type: "cash",
      value: cashBalance,
      percentage: (cashBalance / denom) * 100,
    })
  }

  rows.sort((a, b) => b.value - a.value)

  let cumulative = 0
  return rows.map((r) => {
    cumulative += r.percentage
    return { ...r, cumulativePercentage: cumulative }
  })
}

// ---------------------------------------------------------------------------
// Concentration metrics
// ---------------------------------------------------------------------------

export function concentrationMetrics(
  holdings: readonly Holding[],
  ilpProducts: readonly IlpProductForAllocation[],
  cashBalance: number,
  ilpTotalSum: number,
  fullPortfolioTotal: number,
): ConcentrationMetrics {
  const positions = buildUnifiedPositionList(
    holdings,
    ilpProducts,
    cashBalance,
    fullPortfolioTotal,
  )

  const positionCount = positions.length
  const largestName = positions[0]?.name ?? "—"
  const largestPct = positions[0]?.percentage ?? 0
  const top5Pct = positions.slice(0, 5).reduce((s, p) => s + p.percentage, 0)

  // Currency split
  const denom = fullPortfolioTotal > 0 ? fullPortfolioTotal : 1
  let sgd = 0
  let usd = 0
  for (const h of holdings) {
    const v = h.currentValue ?? 0
    if (v <= 0) continue
    if (currencyForHolding(h.symbol, h.type) === "SGD") sgd += v
    else usd += v
  }
  sgd += ilpTotalSum + (cashBalance > 0 ? cashBalance : 0)

  const ilpPct = denom > 0 ? (ilpTotalSum / denom) * 100 : 0

  return {
    positionCount,
    largestName,
    largestPct,
    top5Pct,
    sgdPct: (sgd / denom) * 100,
    usdPct: (usd / denom) * 100,
    ilpPct,
  }
}

// ---------------------------------------------------------------------------
// ILP look-through: effective asset mix for the whole portfolio
// ---------------------------------------------------------------------------

function mapDirectHoldingToAssetClass(type: string): string {
  switch (type) {
    case "stock":
    case "etf":
      return "Equities"
    case "bond":
      return "Fixed Income"
    case "gold":
    case "silver":
      return "Commodities"
    default:
      return "Other"
  }
}

export function buildLookThroughAllocation(
  holdings: readonly Holding[],
  ilpProducts: readonly IlpProductForAllocation[],
  cashBalance: number,
): AllocationData[] {
  const buckets = new Map<string, number>()

  // Direct holdings → broad asset class
  for (const h of holdings) {
    const v = h.currentValue ?? 0
    if (v <= 0) continue
    const cls = mapDirectHoldingToAssetClass(h.type)
    buckets.set(cls, (buckets.get(cls) ?? 0) + v)
  }

  // Cash
  if (cashBalance > 0) {
    buckets.set("Cash", (buckets.get("Cash") ?? 0) + cashBalance)
  }

  // Decompose ILP using fund report assetAllocation
  for (const p of ilpProducts) {
    const fv = p.latestEntry?.fund_value ?? 0
    if (fv <= 0) continue

    const snapshot = parseFundReportSnapshot(
      p.latestEntry?.fund_report_snapshot ?? null,
    )
    const rows = snapshot?.assetAllocation
    if (Array.isArray(rows) && rows.length > 0) {
      let totalWeight = 0
      const parsed: { label: string; w: number }[] = []
      for (const r of rows) {
        const w =
          typeof r.weightPct === "number" && Number.isFinite(r.weightPct)
            ? Math.max(0, r.weightPct)
            : 0
        if (w > 0) {
          parsed.push({ label: r.label.trim() || "Other", w })
          totalWeight += w
        }
      }
      if (totalWeight > 0) {
        for (const { label, w } of parsed) {
          const contrib = fv * (w / totalWeight)
          buckets.set(label, (buckets.get(label) ?? 0) + contrib)
        }
        continue
      }
    }

    // No fund report → unclassified
    buckets.set("ILP (unclassified)", (buckets.get("ILP (unclassified)") ?? 0) + fv)
  }

  const total = [...buckets.values()].reduce((s, v) => s + v, 0)
  const denom = total > 0 ? total : 1
  return [...buckets.entries()]
    .map(([name, value]) => ({
      name,
      value,
      percentage: (value / denom) * 100,
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
}

// ---------------------------------------------------------------------------
// Cross-ILP top holdings (all ILP products merged as one virtual group)
// ---------------------------------------------------------------------------

export type TopHoldingRow = {
  rank: number
  name: string
  sector: string
  weightPct: number
}

export function buildCrossIlpTopHoldings(
  ilpProducts: readonly IlpProductForAllocation[],
): TopHoldingRow[] | null {
  // Build IlpGroupMemberForDonut[] from all products
  const members: IlpGroupMemberForDonut[] = ilpProducts
    .filter((p) => (p.latestEntry?.fund_value ?? 0) > 0)
    .map((p) => ({
      name: p.name,
      fundValue: p.latestEntry!.fund_value,
      fundReportSnapshot: p.latestEntry?.fund_report_snapshot ?? null,
    }))

  if (members.length === 0) return null

  const slices = groupTopHoldingsSlicesForIlpGroup(members, { topN: 10 })
  if (!slices || slices.length === 0) return null

  return slices.map((s, i) => ({
    rank: i + 1,
    name: s.name,
    sector: sectorForHolding(members, s.name),
    weightPct: s.percentage,
  }))
}

/** Find the sector for a security name by searching across all fund report snapshots. */
function sectorForHolding(
  members: readonly IlpGroupMemberForDonut[],
  securityName: string,
): string {
  for (const m of members) {
    const snapshot = parseFundReportSnapshot(m.fundReportSnapshot ?? null)
    if (!snapshot?.topHoldings) continue
    const match = snapshot.topHoldings.find(
      (h) => h.securityName.trim() === securityName,
    )
    if (match?.sector) return match.sector
  }
  return ""
}

// ---------------------------------------------------------------------------
// Check if any ILP has fund report data (for conditional rendering)
// ---------------------------------------------------------------------------

export function hasIlpLookThroughData(
  ilpProducts: readonly IlpProductForAllocation[],
): boolean {
  // Either blended asset mix or top holdings must be available
  const members: IlpGroupMemberForDonut[] = ilpProducts
    .filter((p) => (p.latestEntry?.fund_value ?? 0) > 0)
    .map((p) => ({
      name: p.name,
      fundValue: p.latestEntry!.fund_value,
      fundReportSnapshot: p.latestEntry?.fund_report_snapshot ?? null,
    }))

  if (members.length === 0) return false

  const holdings = groupTopHoldingsSlicesForIlpGroup(members)
  return holdings != null
}
