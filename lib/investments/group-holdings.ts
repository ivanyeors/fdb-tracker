import type { Holding } from "@/lib/investments/holding"

export function holdingGroupKey(symbol: string, type: string): string {
  return `${type.trim().toLowerCase()}::${symbol.trim().toUpperCase()}`
}

/**
 * Merge multiple `investments` rows that share the same symbol + type
 * (e.g. different profiles in a combined family view).
 */
export function aggregateLotsToHolding(lots: Holding[]): Holding {
  if (lots.length === 0) {
    throw new Error("aggregateLotsToHolding: empty lots")
  }

  const sortedLots = [...lots].sort((a, b) => {
    const ta = a.createdAt ?? ""
    const tb = b.createdAt ?? ""
    return ta.localeCompare(tb)
  })

  const totalUnits = sortedLots.reduce((s, h) => s + h.units, 0)
  const totalCost = sortedLots.reduce((s, h) => s + h.costBasis, 0)

  let currentValueSum = 0
  let currentValueParts = 0
  for (const h of sortedLots) {
    if (h.currentValue != null) {
      currentValueSum += h.currentValue
      currentValueParts += 1
    }
  }
  const currentValue =
    currentValueParts === 0 ? null : currentValueSum

  let pnlSum = 0
  let pnlParts = 0
  for (const h of sortedLots) {
    if (h.pnl != null) {
      pnlSum += h.pnl
      pnlParts += 1
    }
  }
  const pnl = pnlParts === 0 ? null : pnlSum

  const costPerUnit =
    totalUnits > 0 ? totalCost / totalUnits : sortedLots[0].costPerUnit

  const currentPrice =
    currentValue != null && totalUnits > 0
      ? currentValue / totalUnits
      : null

  const pnlPct =
    totalCost > 0 && pnl != null ? (pnl / totalCost) * 100 : null

  const canonicalSymbol = sortedLots[0].symbol
  const type = sortedLots[0].type
  const groupKey = holdingGroupKey(canonicalSymbol, type)

  return {
    id: `group:${groupKey}`,
    symbol: canonicalSymbol,
    type,
    units: totalUnits,
    costPerUnit,
    costBasis: totalCost,
    currentPrice,
    currentValue,
    pnl,
    pnlPct,
    portfolioPct: 0,
    createdAt: sortedLots[0].createdAt,
  }
}

export function groupHoldings(holdings: Holding[]): {
  summary: Holding
  lots: Holding[]
  groupKey: string
}[] {
  const map = new Map<string, Holding[]>()
  for (const h of holdings) {
    const key = holdingGroupKey(h.symbol, h.type)
    const arr = map.get(key)
    if (arr) arr.push(h)
    else map.set(key, [h])
  }

  const keys = [...map.keys()].sort((a, b) => a.localeCompare(b))
  return keys.map((key) => {
    const lots = map.get(key)!
    const summary = aggregateLotsToHolding(lots)
    return { summary, lots, groupKey: key }
  })
}
