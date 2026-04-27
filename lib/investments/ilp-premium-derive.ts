/** Split group total across members by allocation %; last product absorbs rounding remainder. */
export function deriveMonthlyPremiumsFromGroupTotal(
  groupTotal: number,
  items: { productId: string; allocationPct: number }[],
): Map<string, number> {
  const map = new Map<string, number>()
  if (items.length === 0) return map
  if (items.length === 1) {
    map.set(items[0].productId, Math.round(groupTotal * 100) / 100)
    return map
  }
  let allocated = 0
  for (let i = 0; i < items.length - 1; i++) {
    const row = items[i]
    const amt = Math.round(((groupTotal * row.allocationPct) / 100) * 100) / 100
    allocated += amt
    map.set(row.productId, amt)
  }
  const last = items[items.length - 1]
  const lastAmt = Math.round((groupTotal - allocated) * 100) / 100
  map.set(last.productId, lastAmt)
  return map
}

/** Number of months elapsed since a start date. */
export function monthsElapsedSinceGroupStart(startDate: string): number {
  const start = new Date(startDate)
  const now = new Date()
  return (
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth())
  )
}

/** Total invested over time = monthly premium * months elapsed. */
export function totalInvestedOverTime(
  monthlyPremium: number,
  monthsElapsed: number,
): number {
  return Math.max(0, monthlyPremium * Math.max(0, monthsElapsed))
}
