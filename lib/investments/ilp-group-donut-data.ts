import {
  morningstarCategoryFromSnapshot,
  type DonutSliceRow,
} from "@/lib/investments/ilp-snapshot-ui"

export type IlpGroupMemberForDonut = {
  name: string
  fundValue: number
  fundReportSnapshot?: Record<string, unknown> | null
}

/**
 * Donut slices for a fund group: bucket by Morningstar category when present on a fund’s
 * latest snapshot; otherwise use the fund name. Sums values per bucket, percentages within group.
 */
export function allocationSlicesForIlpGroup(
  members: readonly IlpGroupMemberForDonut[]
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
  members: readonly IlpGroupMemberForDonut[]
): boolean {
  return members.some(
    (m) =>
      m.fundValue > 0 &&
      morningstarCategoryFromSnapshot(m.fundReportSnapshot ?? null) != null
  )
}
