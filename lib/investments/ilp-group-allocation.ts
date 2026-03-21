/** Max rounding drift allowed when comparing allocation sums to 100%. */
export const ILP_GROUP_ALLOCATION_EPSILON = 0.01

export function sumAllocationPcts(pcts: number[]): number {
  return pcts.reduce((a, b) => a + b, 0)
}

export function isValidIlpGroupAllocationSum(sum: number): boolean {
  return Math.abs(sum - 100) <= ILP_GROUP_ALLOCATION_EPSILON
}

export function allocationSumMessage(sum: number): string {
  return `Allocations for this group must total 100% (currently ${sum.toFixed(2)}%).`
}

/** Split 100% across n rows (2 decimal places; last row absorbs remainder). */
export function split100Across(n: number): number[] {
  if (n <= 0) return []
  if (n === 1) return [100]
  const base = Math.floor(10000 / n) / 100
  const rows = Array.from({ length: n }, () => base)
  const s = sumAllocationPcts(rows)
  rows[n - 1] = Math.round((100 - s + rows[n - 1]!) * 100) / 100
  return rows
}
