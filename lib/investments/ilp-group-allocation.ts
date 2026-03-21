/** Max rounding drift allowed when comparing allocation sums to 100%. */
export const ILP_GROUP_ALLOCATION_EPSILON = 0.01

export function sumAllocationPcts(pcts: number[]): number {
  return pcts.reduce((a, b) => a + b, 0)
}

/** Sum allocation percentages, excluding entries at exactly 0 (switch-outs). */
export function sumNonZeroAllocationPcts(pcts: number[]): number {
  return pcts.filter((p) => p > 0).reduce((a, b) => a + b, 0)
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
/**
 * Build unique rows for PATCH /groups/:id/allocations. When a file maps to an ILP
 * that is already listed as an existing group member, e:id and n:fileIndex both
 * reference the same product — merge percentages so the API never receives duplicates.
 */
export function mergeMultiGroupAllocationItems(
  members: { id: string; name: string }[],
  newProductIds: string[],
  multiAllocPct: Record<string, number>,
): { productId: string; allocationPct: number }[] {
  const byId = new Map<string, number>()
  for (const m of members) {
    const pct = multiAllocPct[`e:${m.id}`]
    if (pct == null) throw new Error(`Missing allocation for ${m.name}.`)
    byId.set(m.id, (byId.get(m.id) ?? 0) + pct)
  }
  for (let fi = 0; fi < newProductIds.length; fi++) {
    const pid = newProductIds[fi]!
    const pct = multiAllocPct[`n:${fi}`]
    if (pct == null) throw new Error(`Missing allocation for file ${fi + 1}.`)
    byId.set(pid, (byId.get(pid) ?? 0) + pct)
  }
  return [...byId.entries()].map(([productId, allocationPct]) => ({
    productId,
    allocationPct,
  }))
}

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
