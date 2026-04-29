import { currentMonthYm, ilpEntryMonthKey } from "@/lib/investments/ilp-chart"
import { fundValueForAllocation as fundValueForAllocationFromEntries } from "@/lib/investments/ilp-fund-value-for-allocation"

export type IlpFundGroupMembership = {
  id: string
  group_id: string
  group_name: string
  allocation_pct: number
  group_premium_amount?: number | null
  premium_payment_mode?: string | null
  group_profile_id?: string | null
}

export type IlpProductWithEntries = {
  id: string
  name: string
  profile_id?: string | null
  monthly_premium: number
  premium_payment_mode?: string | null
  end_date: string
  created_at: string
  fund_group_memberships?: IlpFundGroupMembership[]
  latestEntry: {
    fund_value: number
    month: string
    premiums_paid?: number | null
    fund_report_snapshot?: Record<string, unknown> | null
  } | null
  entries: {
    month: string
    fund_value: number
    premiums_paid?: number | null
    fund_report_snapshot?: Record<string, unknown> | null
  }[]
}

export type IlpCardRowData = {
  productId: string
  name: string
  profileId: string | null
  groupId: string | null
  groupName: string | null
  groupAllocationPct: number | null
  fundValue: number
  totalPremiumsPaid: number
  premiumsSource: "entry" | "estimated"
  returnPct: number
  monthlyPremium: number
  premiumPaymentMode: "monthly" | "one_time"
  groupPremiumAmount: number | null
  endDate: string
  latestEntryMonth: string | null
  latestEntryFundValue: number
  latestEntryPremiumsPaid: number | null
  monthlyData: { month: string; value: number }[]
  fundReportSnapshot: Record<string, unknown> | null
  /** Balance used to weight group donuts; last positive month if latest is zero. */
  fundValueForAllocation: number
  /** All group memberships for this product */
  fundGroupMemberships: IlpFundGroupMembership[]
}

/**
 * Build card data from a product. When `forGroupId` is provided,
 * the group-specific fields (groupId, groupName, groupAllocationPct, groupPremiumAmount)
 * reflect that specific group's membership. Otherwise uses the first membership.
 */
export function buildIlpCardDataFromProduct(
  p: IlpProductWithEntries,
  forGroupId?: string,
): IlpCardRowData {
  const fundValue = p.latestEntry?.fund_value ?? 0
  const startDate = new Date(p.created_at)
  const now = new Date()
  const monthsPaid = Math.max(
    0,
    Math.floor(
      (now.getFullYear() - startDate.getFullYear()) * 12 +
        (now.getMonth() - startDate.getMonth())
    )
  )
  const estimatedPremiums =
    p.premium_payment_mode === "one_time"
      ? 0
      : p.monthly_premium * Math.max(1, monthsPaid)
  const entryPremiums = p.latestEntry?.premiums_paid
  const useEntryPremiums = entryPremiums != null && Number(entryPremiums) > 0
  const totalPremiumsPaid = useEntryPremiums
    ? Number(entryPremiums)
    : estimatedPremiums
  const premiumsSource = useEntryPremiums
    ? ("entry" as const)
    : ("estimated" as const)
  const returnPct =
    totalPremiumsPaid > 0
      ? ((fundValue - totalPremiumsPaid) / totalPremiumsPaid) * 100
      : 0
  const sortedEntries = [...(p.entries ?? [])].sort((a, b) =>
    a.month.localeCompare(b.month)
  )
  let monthlyData = sortedEntries.map((e) => ({
    month: ilpEntryMonthKey(e.month),
    value: Number(e.fund_value),
  }))
  if (monthlyData.length === 0 && fundValue > 0) {
    monthlyData = [{ month: currentMonthYm(), value: fundValue }]
  }
  const pm: "monthly" | "one_time" =
    p.premium_payment_mode === "one_time" ? "one_time" : "monthly"

  const memberships = p.fund_group_memberships ?? []
  const membership = forGroupId
    ? memberships.find((m) => m.group_id === forGroupId) ?? memberships[0]
    : memberships[0]

  const gAmt = membership?.group_premium_amount
  const fundValueForAllocation = fundValueForAllocationFromEntries(
    p.latestEntry,
    p.entries ?? [],
  )
  return {
    productId: p.id,
    name: p.name,
    profileId: p.profile_id ?? null,
    groupId: membership?.group_id ?? null,
    groupName: membership?.group_name ?? null,
    groupAllocationPct:
      membership?.allocation_pct == null ? null : Number(membership.allocation_pct),
    fundValue,
    fundValueForAllocation,
    totalPremiumsPaid,
    premiumsSource,
    returnPct,
    monthlyPremium: p.monthly_premium,
    premiumPaymentMode: pm,
    groupPremiumAmount:
      gAmt != null && Number.isFinite(Number(gAmt)) ? Number(gAmt) : null,
    endDate: p.end_date,
    latestEntryMonth: p.latestEntry?.month ?? null,
    latestEntryFundValue: p.latestEntry?.fund_value ?? 0,
    latestEntryPremiumsPaid: p.latestEntry?.premiums_paid ?? null,
    monthlyData,
    fundReportSnapshot: p.latestEntry?.fund_report_snapshot ?? null,
    fundGroupMemberships: memberships,
  }
}
