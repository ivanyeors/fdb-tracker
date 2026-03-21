/**
 * Dashboard ILP donut: one slice per fund group (summed NAV) or per standalone product.
 */

export type IlpProductSliceInput = {
  name: string
  latestEntry: { fund_value: number } | null
  ilp_fund_groups?: { id: string; name: string } | null
}

export type AllocationSliceRow = {
  name: string
  value: number
  percentage: number
}

export function allocationByIlpGroupOrStandalone(
  products: readonly IlpProductSliceInput[]
): AllocationSliceRow[] {
  const groupMap = new Map<string, { title: string; value: number }>()
  const standalone: { name: string; value: number }[] = []

  for (const p of products) {
    const fv = p.latestEntry?.fund_value ?? 0
    if (fv <= 0) continue
    const gid = p.ilp_fund_groups?.id ?? null
    if (gid) {
      const title = p.ilp_fund_groups?.name?.trim() || "Fund group"
      const cur = groupMap.get(gid)
      if (cur) {
        cur.value += fv
      } else {
        groupMap.set(gid, { title, value: fv })
      }
    } else {
      standalone.push({ name: p.name, value: fv })
    }
  }

  const rows = [
    ...[...groupMap.values()].map((v) => ({ name: v.title, value: v.value })),
    ...standalone,
  ]
  const sum = rows.reduce((s, r) => s + r.value, 0)
  return rows
    .map((r) => ({
      name: r.name,
      value: r.value,
      percentage: sum > 0 ? (r.value / sum) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)
}
