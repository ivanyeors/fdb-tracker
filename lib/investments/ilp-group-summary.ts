/**
 * Builds summary data for an ILP fund group: totals, returns, and per-product breakdowns.
 */

export type IlpGroupSummaryProduct = {
  productId: string
  name: string
  allocationPct: number
  premiumsPaid: number
  fundValue: number
  returnPct: number
}

export type IlpGroupMonthlyVariance = {
  month: string
  totalFundValue: number
  totalPremiumsPaid: number
  deltaFromPrevious: number
}

export type IlpGroupSummary = {
  totalPremiumsPaid: number
  totalFundValue: number
  returnPct: number
  monthlyVariance: IlpGroupMonthlyVariance[]
  individualBreakdowns: IlpGroupSummaryProduct[]
}

type ProductInput = {
  id: string
  name: string
  entries: Array<{
    month: string
    fund_value: number
    premiums_paid: number | null
  }>
  fund_group_memberships?: Array<{
    group_id: string
    allocation_pct: number
  }>
}

export function buildGroupSummary(
  products: readonly ProductInput[],
  groupId: string,
): IlpGroupSummary {
  // Filter to products in this group
  const groupProducts = products.filter((p) =>
    p.fund_group_memberships?.some((m) => m.group_id === groupId),
  )

  // Build individual breakdowns
  const individualBreakdowns: IlpGroupSummaryProduct[] = groupProducts.map(
    (p) => {
      const membership = p.fund_group_memberships?.find(
        (m) => m.group_id === groupId,
      )
      const latestEntry = [...p.entries].sort((a, b) =>
        b.month.localeCompare(a.month),
      )[0]
      const fundValue = latestEntry?.fund_value ?? 0
      const premiumsPaid = latestEntry?.premiums_paid ?? 0
      const returnPct =
        premiumsPaid > 0
          ? ((fundValue - premiumsPaid) / premiumsPaid) * 100
          : 0

      return {
        productId: p.id,
        name: p.name,
        allocationPct: membership?.allocation_pct ?? 0,
        premiumsPaid,
        fundValue,
        returnPct,
      }
    },
  )

  const totalPremiumsPaid = individualBreakdowns.reduce(
    (s, p) => s + p.premiumsPaid,
    0,
  )
  const totalFundValue = individualBreakdowns.reduce(
    (s, p) => s + p.fundValue,
    0,
  )
  const returnPct =
    totalPremiumsPaid > 0
      ? ((totalFundValue - totalPremiumsPaid) / totalPremiumsPaid) * 100
      : 0

  // Build monthly variance
  const monthMap = new Map<
    string,
    { fundValue: number; premiumsPaid: number }
  >()
  for (const p of groupProducts) {
    for (const e of p.entries) {
      const existing = monthMap.get(e.month) ?? {
        fundValue: 0,
        premiumsPaid: 0,
      }
      existing.fundValue += e.fund_value
      existing.premiumsPaid += e.premiums_paid ?? 0
      monthMap.set(e.month, existing)
    }
  }

  const sortedMonths = [...monthMap.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )
  const monthlyVariance: IlpGroupMonthlyVariance[] = sortedMonths.map(
    ([month, data], i) => {
      const prev =
        i > 0 ? sortedMonths[i - 1][1].fundValue : data.fundValue
      return {
        month,
        totalFundValue: data.fundValue,
        totalPremiumsPaid: data.premiumsPaid,
        deltaFromPrevious: data.fundValue - prev,
      }
    },
  )

  return {
    totalPremiumsPaid,
    totalFundValue,
    returnPct,
    monthlyVariance,
    individualBreakdowns,
  }
}
