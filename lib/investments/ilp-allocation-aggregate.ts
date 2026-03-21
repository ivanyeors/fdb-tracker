/**
 * Dashboard ILP donut helpers: by fund group (aggregated NAV) or per product with group context.
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
  const perName = new Map<string, number>()
  const disambiguated = rows.map((r) => {
    const n = (perName.get(r.name) ?? 0) + 1
    perName.set(r.name, n)
    return {
      name: n === 1 ? r.name : `${r.name} (${n})`,
      value: r.value,
    }
  })
  const sum = disambiguated.reduce((s, r) => s + r.value, 0)
  return disambiguated
    .map((r) => ({
      name: r.name,
      value: r.value,
      percentage: sum > 0 ? (r.value / sum) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)
}

/**
 * Hero ILP donut: one slice per product (latest fund value) so multiple funds in a group
 * show as separate colored segments. Grouped products use `Group · Fund name` labels.
 */
export function allocationByIlpProductWithGroupLabel(
  products: readonly IlpProductSliceInput[],
): AllocationSliceRow[] {
  const rows: { name: string; value: number }[] = []
  for (const p of products) {
    const fv = p.latestEntry?.fund_value ?? 0
    if (fv <= 0) continue
    const gid = p.ilp_fund_groups?.id ?? null
    const fundName = p.name?.trim() || "ILP fund"
    const label =
      gid != null
        ? `${p.ilp_fund_groups?.name?.trim() || "Fund group"} · ${fundName}`
        : fundName
    rows.push({ name: label, value: fv })
  }
  const perName = new Map<string, number>()
  const disambiguated = rows.map((r) => {
    const n = (perName.get(r.name) ?? 0) + 1
    perName.set(r.name, n)
    return {
      name: n === 1 ? r.name : `${r.name} (${n})`,
      value: r.value,
    }
  })
  const sum = disambiguated.reduce((s, r) => s + r.value, 0)
  return disambiguated
    .map((r) => ({
      name: r.name,
      value: r.value,
      percentage: sum > 0 ? (r.value / sum) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)
}
