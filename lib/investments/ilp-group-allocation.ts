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

/** Renormalize positive weights to percentages that sum to 100 (2 dp; last absorbs drift). */
export function normalizeProportionalTo100(weights: number[]): number[] {
  const n = weights.length
  if (n === 0) return []
  if (n === 1) return [100]
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0) return split100Across(n)

  const out: number[] = []
  let acc = 0
  for (let i = 0; i < n - 1; i++) {
    const v = Math.round(((weights[i]! / sum) * 100) * 100) / 100
    out.push(v)
    acc += v
  }
  out.push(Math.round((100 - acc) * 100) / 100)
  return out
}

/**
 * Set one fund to 0% and spread its share across the others (proportional to their
 * current weights; if all others were 0, split evenly).
 */
export function applySwitchOutZero(
  items: { productId: string; allocationPct: number }[],
  productId: string,
): { productId: string; allocationPct: number }[] {
  const rest = items.filter((x) => x.productId !== productId)
  if (rest.length === 0) return items
  const weights = rest.map((x) => x.allocationPct)
  const wsum = sumAllocationPcts(weights)
  let newPcts: number[]
  if (wsum <= ILP_GROUP_ALLOCATION_EPSILON) {
    newPcts = split100Across(rest.length)
  } else {
    newPcts = normalizeProportionalTo100(weights)
  }
  const m = new Map(rest.map((r, i) => [r.productId, newPcts[i]!]))
  return items.map((row) =>
    row.productId === productId
      ? { ...row, allocationPct: 0 }
      : { ...row, allocationPct: m.get(row.productId) ?? 0 },
  )
}
