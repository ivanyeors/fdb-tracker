export type PnLResult = {
  symbol: string
  units: number
  costBasis: number
  currentPrice: number
  marketValue: number
  unrealisedPnL: number
  unrealisedPnLPct: number
}

export function calculatePnL(
  units: number,
  costBasis: number,
  currentPrice: number,
): Pick<PnLResult, "marketValue" | "unrealisedPnL" | "unrealisedPnLPct"> {
  const marketValue = units * currentPrice
  const totalCost = units * costBasis
  const unrealisedPnL = marketValue - totalCost
  const unrealisedPnLPct = totalCost === 0 ? 0 : (unrealisedPnL / totalCost) * 100

  return { marketValue, unrealisedPnL, unrealisedPnLPct }
}

export type AllocationEntry = {
  symbol: string
  type: string
  marketValue: number
  allocationPct: number
}

export function calculatePortfolioAllocation(
  holdings: Array<{ symbol: string; type: string; marketValue: number }>,
): AllocationEntry[] {
  const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0)

  return holdings.map((h) => ({
    symbol: h.symbol,
    type: h.type,
    marketValue: h.marketValue,
    allocationPct: totalValue === 0 ? 0 : (h.marketValue / totalValue) * 100,
  }))
}

export function calculateWeightedAverageCost(
  existingUnits: number,
  existingCostBasis: number,
  newUnits: number,
  newPrice: number,
  commission?: number,
): number {
  const totalCost =
    existingUnits * existingCostBasis + newUnits * newPrice + (commission ?? 0)
  const totalUnits = existingUnits + newUnits
  return totalUnits === 0 ? 0 : totalCost / totalUnits
}
