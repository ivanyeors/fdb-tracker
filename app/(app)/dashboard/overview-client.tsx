"use client"

import { useEffect, useMemo } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import {
  Card,
  CardContent,
  CardCTA,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { MetricCard } from "@/components/dashboard/metric-card"
import { SectionHeader } from "@/components/dashboard/section-header"
import { SavingsThisMonthCard } from "@/components/dashboard/savings-this-month-card"
import { InvestmentCard } from "@/components/dashboard/investments/investment-card"
import { SeasonalityPrompts } from "@/components/dashboard/investments/seasonality-prompts"
import { CpfCard } from "@/components/dashboard/cpf/cpf-card"
import { IlpCard } from "@/components/dashboard/investments/ilp-card"
import { IlpGroupSummaryCard } from "@/components/dashboard/investments/ilp-group-summary-card"
import { fundValueForAllocation } from "@/lib/investments/ilp-fund-value-for-allocation"
import type { WaterfallDataV2 } from "@/components/dashboard/cashflow/waterfall-chart"
import {
  JournalList,
  type JournalEntry,
} from "@/components/dashboard/investments/journal-list"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { useGlobalMonth } from "@/hooks/use-global-month"
import { useApi } from "@/hooks/use-api"
import { currentMonthYm, ilpEntryMonthKey } from "@/lib/investments/ilp-chart"
import { getCalendarYearRange } from "@/lib/date-range"
import { cn, formatCurrency } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import { ChartSkeleton } from "@/components/loading"
import { Skeleton } from "@/components/ui/skeleton"

const SectionedWaterfall = dynamic(
  () =>
    import("@/components/dashboard/cashflow/sectioned-waterfall").then(
      (m) => m.SectionedWaterfall
    ),
  { ssr: false, loading: () => <ChartSkeleton className="h-[300px]" /> }
)

const CashflowSankey = dynamic(
  () =>
    import("@/components/dashboard/cashflow/cashflow-sankey").then(
      (m) => m.CashflowSankey
    ),
  { ssr: false, loading: () => <ChartSkeleton className="h-[300px]" /> }
)

const monthLabels: Record<string, string> = {
  "01": "Jan",
  "02": "Feb",
  "03": "Mar",
  "04": "Apr",
  "05": "May",
  "06": "Jun",
  "07": "Jul",
  "08": "Aug",
  "09": "Sep",
  "10": "Oct",
  "11": "Nov",
  "12": "Dec",
}

function formatTrendMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-")
  return `${monthLabels[month ?? ""] ?? month} ${year}`
}

/** Last series value per calendar month from daily investment totals (NLV + ILP). */
function aggregateDailyInvestmentToMonthly(
  daily: { date: string; value: number }[]
): { month: string; value: number }[] {
  const byYm = new Map<string, { date: string; value: number }>()
  for (const d of daily) {
    const ym = d.date.slice(0, 7)
    const prev = byYm.get(ym)
    if (!prev || d.date > prev.date) {
      byYm.set(ym, { date: d.date, value: d.value })
    }
  }
  return [...byYm.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, v]) => ({
      month: new Date(ym + "-01T12:00:00").toLocaleString("en-US", {
        month: "short",
      }),
      value: v.value,
    }))
}

type Goal = {
  id: string
  name: string
  target_amount: number
  current_amount: number
  monthly_auto_amount: number
  deadline: string | null
  category: string
}

type Policy = {
  id: string
  coverage_amount: number | null
  is_active: boolean
}

type IlpProductWithEntries = {
  id: string
  name: string
  monthly_premium: number
  premium_payment_mode?: string | null
  end_date: string
  created_at: string
  fund_group_memberships?: {
    id: string
    group_id: string
    group_name: string
    allocation_pct: number
    group_premium_amount?: number | null
  }[]
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
  }[]
}

type OverviewData = {
  totalNetWorth?: number
  liquidNetWorth?: number
  savingsRate?: number
  bankTotal?: number
  cpfTotal?: number
  cpfBreakdown?: { oa: number; sa: number; ma: number }
  cpfDelta?: number
  investmentTotal?: number
  investmentCostBasis?: number
  netLiquidValue?: number
  ilpFundTotal?: number
  loanTotal?: number
  loanMonthlyTotal?: number
  loanRemainingMonths?: number
  latestInflow?: number
  latestOutflow?: number
  latestMonth?: string | null
  previousMonthInflow?: number
  previousMonthOutflow?: number
  previousMonthSavings?: number
}

type CashflowRangeEntry = {
  month: string
  inflow: number
  totalOutflow: number
}

type TransactionRaw = {
  id: string
  symbol: string
  type: string
  quantity: number
  price: number
  journal_text?: string
  created_at: string
}

export type OverviewInitialData = {
  overview: OverviewData | null
  cashflowRange: CashflowRangeEntry[] | null
  waterfall: WaterfallDataV2 | null
  ilp: IlpProductWithEntries[] | null
  goals: Goal[] | null
  insurance: Policy[] | null
  transactions: TransactionRaw[] | null
  investmentHistory: { data: { date: string; value: number }[] } | null
}

export function OverviewClient({
  initialData,
}: {
  readonly initialData: OverviewInitialData
}) {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const { effectiveMonth, setAvailableMonths } = useGlobalMonth()

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (activeProfileId) p.set("profileId", activeProfileId)
    if (activeFamilyId && !activeProfileId) p.set("familyId", activeFamilyId)
    return p.toString()
  }, [activeProfileId, activeFamilyId])

  const { startMonth, endMonth } = getCalendarYearRange()

  // Cashflow range (12 months)
  const cashflowRangeUrl = `/api/cashflow?startMonth=${startMonth}&endMonth=${endMonth}${qs ? `&${qs}` : ""}`
  const { data: cashflowRangeRaw, isLoading: isCashflowLoading } = useApi<
    CashflowRangeEntry[]
  >(cashflowRangeUrl, { fallbackData: initialData.cashflowRange ?? undefined })
  const cashflowRangeData = useMemo(
    () => cashflowRangeRaw ?? [],
    [cashflowRangeRaw]
  )
  const cashflowMonths = useMemo(
    () => (cashflowRangeRaw ?? []).map((r) => r.month).reverse(),
    [cashflowRangeRaw]
  )

  // Sync available months to global context for TopNav picker
  useEffect(() => {
    if (cashflowMonths.length > 0) {
      setAvailableMonths(cashflowMonths)
    }
  }, [cashflowMonths, setAvailableMonths])

  // Detect whether the selected month has cashflow data
  const hasMonthData =
    !isCashflowLoading && cashflowMonths.includes(effectiveMonth)

  // Overview data
  const overviewQs = qs ? `${qs}&` : ""
  const overviewBaseUrl = qs ? `/api/overview?${qs}` : "/api/overview"
  const overviewUrl = effectiveMonth
    ? `/api/overview?${overviewQs}month=${effectiveMonth}`
    : overviewBaseUrl
  const { data, isLoading: isOverviewLoading } = useApi<OverviewData>(
    overviewUrl,
    { fallbackData: initialData.overview ?? undefined }
  )

  // Waterfall data for selected month
  const waterfallQsTail = qs ? `&${qs}` : ""
  const waterfallUrl = effectiveMonth
    ? `/api/cashflow?month=${effectiveMonth}${waterfallQsTail}`
    : null
  const { data: waterfallData } = useApi<WaterfallDataV2>(waterfallUrl, {
    fallbackData: initialData.waterfall ?? undefined,
  })

  // ILP products
  const ilpUrl = `/api/investments/ilp${qs ? `?${qs}` : ""}`
  const { data: ilpRaw, isLoading: isIlpLoading } = useApi<
    IlpProductWithEntries[]
  >(ilpUrl, { fallbackData: initialData.ilp ?? undefined })
  const ilpProducts = useMemo(
    () => (ilpRaw ?? []).map((p) => ({ ...p, entries: p.entries ?? [] })),
    [ilpRaw]
  )

  // Goals
  const goalsUrl = `/api/goals${qs ? `?${qs}` : ""}`
  const { data: goals = [], isLoading: isGoalsLoading } = useApi<Goal[]>(
    goalsUrl,
    { fallbackData: initialData.goals ?? undefined }
  )

  // Insurance
  const insuranceUrl = `/api/insurance${qs ? `?${qs}` : ""}`
  const { data: policies = [], isLoading: isInsuranceLoading } = useApi<
    Policy[]
  >(insuranceUrl, { fallbackData: initialData.insurance ?? undefined })

  // Transactions
  const txUrl = `/api/investments/transactions${qs ? `?${qs}&limit=100` : "?limit=100"}`
  const { data: txRaw, isLoading: isTxLoading } = useApi<TransactionRaw[]>(
    txUrl,
    { fallbackData: initialData.transactions ?? undefined }
  )
  const transactions: JournalEntry[] = useMemo(
    () =>
      (txRaw ?? []).map((t) => ({
        id: t.id,
        symbol: t.symbol,
        type: t.type as "buy" | "sell",
        quantity: t.quantity,
        price: t.price,
        journalText: t.journal_text,
        date: t.created_at.slice(0, 10),
      })),
    [txRaw]
  )

  // Investment history
  const historyUrl = qs ? `/api/investments/history?days=30&${qs}` : null
  const { data: historyRaw } = useApi<{
    data: { date: string; value: number }[]
  }>(historyUrl, {
    fallbackData: initialData.investmentHistory ?? undefined,
  })
  const investmentHistory = useMemo(() => historyRaw?.data ?? [], [historyRaw])

  const savingsHistory = useMemo(() => {
    return cashflowRangeData.map((r) => ({
      month: r.month,
      value: r.inflow - r.totalOutflow,
    }))
  }, [cashflowRangeData])

  const savingsTrend = useMemo(() => {
    const savingsThisMonth =
      (data?.latestInflow ?? 0) - (data?.latestOutflow ?? 0)
    const prevSavings = data?.previousMonthSavings
    if (prevSavings !== undefined && prevSavings !== null) {
      if (Math.abs(prevSavings) === 0) return 0
      return ((savingsThisMonth - prevSavings) / Math.abs(prevSavings)) * 100
    }
    if (savingsHistory.length < 2) return 0
    const current = savingsHistory.at(-1)!.value ?? 0
    const previous = savingsHistory.at(-2)!.value ?? 0
    if (previous === 0) return 0
    return ((current - previous) / Math.abs(previous)) * 100
  }, [
    data?.latestInflow,
    data?.latestOutflow,
    data?.previousMonthSavings,
    savingsHistory,
  ])

  const investmentMonthlyData = useMemo((): {
    month: string
    value: number
  }[] => {
    if (investmentHistory.length >= 2) {
      return aggregateDailyInvestmentToMonthly(investmentHistory)
    }

    const investmentTotal = data?.investmentTotal ?? 0
    const netLv = data?.netLiquidValue
    const apiIlp = data?.ilpFundTotal
    const ilpTotalByMonth = new Map<string, number>()
    for (const p of ilpProducts) {
      for (const e of p.entries ?? []) {
        const monthStr = e.month.slice(0, 7)
        const existing = ilpTotalByMonth.get(monthStr) ?? 0
        ilpTotalByMonth.set(monthStr, existing + (e.fund_value ?? 0))
      }
    }
    const currentIlpTotal = ilpProducts.reduce(
      (sum, p) => sum + (p.latestEntry?.fund_value ?? 0),
      0
    )
    const ilpForSplit =
      apiIlp != null && Number.isFinite(apiIlp) ? apiIlp : currentIlpTotal
    const nonIlp =
      netLv != null && Number.isFinite(netLv)
        ? netLv
        : Math.max(0, investmentTotal - ilpForSplit)
    const allMonths = Array.from(ilpTotalByMonth.keys()).sort((a, b) =>
      a.localeCompare(b)
    )
    if (allMonths.length === 0 && investmentTotal > 0) {
      const now = new Date()
      const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
      return [
        {
          month: new Date(m + "-01").toLocaleString("en-US", {
            month: "short",
          }),
          value: investmentTotal,
        },
      ]
    }
    return allMonths.map((monthKey) => {
      const ilpVal = ilpTotalByMonth.get(monthKey) ?? 0
      return {
        month: new Date(monthKey + "-01").toLocaleString("en-US", {
          month: "short",
        }),
        value: ilpVal + nonIlp,
      }
    })
  }, [
    ilpProducts,
    data?.investmentTotal,
    data?.netLiquidValue,
    data?.ilpFundTotal,
    investmentHistory,
  ])

  const ilpCardsData = useMemo(() => {
    return ilpProducts.map((p) => {
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
      const useEntryPremiums =
        entryPremiums != null && Number(entryPremiums) > 0
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
      const firstMembership = p.fund_group_memberships?.[0]
      const gAmt = firstMembership?.group_premium_amount
      const fvAlloc = fundValueForAllocation(p.latestEntry, p.entries ?? [])
      return {
        productId: p.id,
        name: p.name,
        groupId: firstMembership?.group_id ?? null,
        groupName: firstMembership?.group_name ?? null,
        groupAllocationPct:
          firstMembership?.allocation_pct != null
            ? Number(firstMembership.allocation_pct)
            : null,
        fundValue,
        fundValueForAllocation: fvAlloc,
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
      }
    })
  }, [ilpProducts])

  const ilpGroupedSections = useMemo(() => {
    type Card = (typeof ilpCardsData)[number]
    const withGroup = ilpCardsData.filter((c) => c.groupId)
    const without = ilpCardsData.filter((c) => !c.groupId)

    const map = new Map<string, { title: string; cards: Card[] }>()
    for (const c of withGroup) {
      const gid = c.groupId!
      let bucket = map.get(gid)
      if (!bucket) {
        bucket = { title: c.groupName ?? gid, cards: [] }
        map.set(gid, bucket)
      }
      bucket.cards.push(c)
    }

    const sections = [...map.entries()].map(([key, val]) => ({
      key,
      ...val,
    }))

    if (without.length > 0) {
      sections.push({ key: "_ungrouped", title: "Other ILPs", cards: without })
    }

    return sections
  }, [ilpCardsData])

  const showIlpGrouped = useMemo(
    () => ilpCardsData.some((c) => c.groupId),
    [ilpCardsData]
  )

  const ilpPortfolioTotal = useMemo(
    () => ilpCardsData.reduce((sum, c) => sum + c.fundValue, 0),
    [ilpCardsData]
  )

  const investmentTrend = useMemo(() => {
    const fromDaily =
      investmentHistory.length >= 2
        ? aggregateDailyInvestmentToMonthly(investmentHistory)
        : []
    const monthlyFallback =
      investmentMonthlyData.length >= 2 ? investmentMonthlyData : []
    const series = fromDaily.length >= 2 ? fromDaily : monthlyFallback
    if (series.length < 2) return 0
    const current = series.at(-1)!.value ?? 0
    const previous = series.at(-2)!.value ?? 0
    if (Math.abs(previous) < 1e-9) return 0
    return ((current - previous) / Math.abs(previous)) * 100
  }, [investmentHistory, investmentMonthlyData])

  const totalInsuranceCoverage = useMemo(
    () =>
      policies
        .filter((p) => p.is_active)
        .reduce((sum, p) => sum + (p.coverage_amount ?? 0), 0),
    [policies]
  )

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Overview"
        description="Net worth, savings rate, and key metrics at a glance."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card
          className={cn(
            !hasMonthData &&
              !isOverviewLoading &&
              !isCashflowLoading &&
              "border-dashed opacity-60"
          )}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cashflow</CardTitle>
            <p className="text-xs text-muted-foreground">
              {(() => {
                if (isOverviewLoading) return ""
                const monthForLabel = effectiveMonth ?? data?.latestMonth
                if (monthForLabel) return formatTrendMonth(monthForLabel)
                return "Latest month"
              })()}
            </p>
          </CardHeader>
          <CardContent>
            {(() => {
              if (isOverviewLoading) {
                return (
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-full" />
                  </div>
                )
              }
              if (!hasMonthData) {
                return (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No cashflow data for this month
                  </p>
                )
              }
              return (
                <>
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">
                        Inflow
                      </span>
                      <span className="font-medium text-emerald-500">
                        ${formatCurrency(data?.latestInflow ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">
                        Outflow
                      </span>
                      <span className="font-medium text-red-500">
                        ${formatCurrency(data?.latestOutflow ?? 0)}
                      </span>
                    </div>
                  </div>
                  <CardCTA href="/dashboard/cashflow">View cashflow</CardCTA>
                </>
              )
            })()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Savings Goals</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              if (isGoalsLoading) return <Skeleton className="h-24 w-full" />
              if (goals.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground">
                    No savings goals. Add them in Settings &rarr; User Settings.
                  </p>
                )
              }
              return (
                <>
                  <div className="space-y-3">
                    {goals.map((goal) => {
                      const progressPct =
                        goal.target_amount > 0
                          ? Math.min(
                              (goal.current_amount / goal.target_amount) * 100,
                              100
                            )
                          : 100
                      return (
                        <div key={goal.id} className="min-w-0 space-y-1.5">
                          <div className="flex min-w-0 items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-medium">
                              {goal.name}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                              {progressPct.toFixed(1)}%
                            </span>
                          </div>
                          <Progress
                            value={progressPct}
                            className={goals.length === 1 ? "h-2" : "h-0.5"}
                          />
                        </div>
                      )
                    })}
                  </div>
                  <CardCTA href="/dashboard/banks#savings-goals">
                    View goals
                  </CardCTA>
                </>
              )
            })()}
          </CardContent>
        </Card>

        <SavingsThisMonthCard
          savingsThisMonth={
            (data?.latestInflow ?? 0) - (data?.latestOutflow ?? 0)
          }
          trend={savingsTrend}
          savingsHistory={savingsHistory}
          latestMonth={effectiveMonth ?? data?.latestMonth ?? null}
          loading={isOverviewLoading || isCashflowLoading}
          noData={!hasMonthData && !isCashflowLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Bank Total"
          value={data?.bankTotal ?? 0}
          prefix="$"
          trend={0}
          trendLabel="vs last month"
          loading={isOverviewLoading}
        />
        <CpfCard
          total={data?.cpfTotal ?? 0}
          breakdown={data?.cpfBreakdown ?? { oa: 0, sa: 0, ma: 0 }}
          delta={data?.cpfDelta ?? 0}
          loading={isOverviewLoading}
        />
        <InvestmentCard
          totalValue={data?.investmentTotal ?? 0}
          totalInvested={data?.investmentCostBasis}
          trend={investmentTrend}
          monthlyData={investmentMonthlyData}
          dailyData={investmentHistory}
          netLiquidValue={data?.netLiquidValue}
          ilpFundTotal={data?.ilpFundTotal}
          loading={isOverviewLoading}
        />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Insurance Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              if (isInsuranceLoading) return <Skeleton className="h-16 w-full" />
              if (policies.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground">
                    No insurance policies. Add in Insurance.
                  </p>
                )
              }
              return (
                <>
                  <div className="flex flex-1 flex-col">
                    <p className="text-2xl font-bold tracking-tight">
                      ${formatCurrency(totalInsuranceCoverage)}
                    </p>
                  </div>
                  <CardCTA href="/dashboard/insurance">View policies</CardCTA>
                </>
              )
            })()}
          </CardContent>
        </Card>
      </div>

      <SeasonalityPrompts variant="compact" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          label="Total Net Worth"
          value={data?.totalNetWorth ?? 0}
          prefix="$"
          trend={0}
          trendLabel="vs last month"
          tooltipId="NET_WORTH"
          loading={isOverviewLoading}
        />
        <MetricCard
          label="Liquid Net Worth"
          value={data?.liquidNetWorth ?? 0}
          prefix="$"
          trend={0}
          trendLabel="vs last month"
          tooltipId="LIQUID_NET_WORTH"
          loading={isOverviewLoading}
        />
        <Card>
          <CardContent>
            {isOverviewLoading ? (
              <>
                <Skeleton className="mb-3 h-4 w-24" />
                <Skeleton className="h-8 w-32" />
              </>
            ) : (
              <>
                <div className="flex flex-1 flex-col gap-1">
                  <p className="text-sm text-muted-foreground">
                    Loans Outstanding
                  </p>
                  <p className="text-2xl font-bold tracking-tight">
                    ${formatCurrency(data?.loanTotal ?? 0)}
                  </p>
                  {(data?.loanMonthlyTotal ?? 0) > 0 && (
                    <p className="text-sm text-muted-foreground">
                      ${formatCurrency(data?.loanMonthlyTotal ?? 0)}/mo
                    </p>
                  )}
                  {(() => {
                    const loanTotal = data?.loanTotal ?? 0
                    const remainingMonths = data?.loanRemainingMonths ?? 0
                    if (loanTotal > 0 && remainingMonths > 0) {
                      const years = Math.floor(remainingMonths / 12)
                      const m = remainingMonths % 12
                      const label =
                        years > 0 ? `${years}y ${m}m left` : `${m}m left`
                      return (
                        <p className="text-sm text-muted-foreground">{label}</p>
                      )
                    }
                    if (loanTotal === 0) return null
                    return (
                      <p className="text-sm text-muted-foreground">Paid off</p>
                    )
                  })()}
                </div>
                <CardCTA href="/dashboard/loans">View all</CardCTA>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {(() => {
        if (isIlpLoading) {
          return (
            <Card>
              <CardContent>
                <Skeleton className="mb-3 h-4 w-24" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          )
        }
        if (ilpCardsData.length === 0) {
          if (activeProfileId || activeFamilyId) {
            return (
              <div className="rounded-lg border bg-card p-4 text-center text-sm text-muted-foreground">
                No ILP plans. Add one in{" "}
                <Link
                  href="/dashboard/investments"
                  className="text-primary hover:underline"
                >
                  Investments
                </Link>
                .
              </div>
            )
          }
          return null
        }
        return (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">ILP Performance</h3>
          {showIlpGrouped ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {ilpGroupedSections
                  .filter((s) => s.key !== "_ungrouped")
                  .map((section) => (
                    <IlpGroupSummaryCard
                      key={section.key}
                      groupId={section.key}
                      title={section.title}
                      cards={section.cards}
                      fullPortfolioTotal={ilpPortfolioTotal}
                      chartHeight={300}
                    />
                  ))}
              </div>
              {ilpGroupedSections.find((s) => s.key === "_ungrouped") && (
                <div className="grid gap-4 md:grid-cols-2">
                  {ilpGroupedSections
                    .find((s) => s.key === "_ungrouped")!
                    .cards.map((card) => (
                      <IlpCard
                        key={card.productId}
                        productId={card.productId}
                        name={card.name}
                        fundValue={card.fundValue}
                        totalPremiumsPaid={card.totalPremiumsPaid}
                        premiumsSource={card.premiumsSource}
                        returnPct={card.returnPct}
                        monthlyPremium={card.monthlyPremium}
                        premiumPaymentMode={card.premiumPaymentMode}
                        groupPremiumAmount={card.groupPremiumAmount}
                        endDate={card.endDate}
                        latestEntryMonth={card.latestEntryMonth}
                        latestEntryFundValue={card.latestEntryFundValue}
                        latestEntryPremiumsPaid={card.latestEntryPremiumsPaid}
                        monthlyData={card.monthlyData}
                        variant="summary"
                      />
                    ))}
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {ilpCardsData.map((card) => (
                <IlpCard
                  key={card.productId}
                  productId={card.productId}
                  name={card.name}
                  fundValue={card.fundValue}
                  totalPremiumsPaid={card.totalPremiumsPaid}
                  premiumsSource={card.premiumsSource}
                  returnPct={card.returnPct}
                  monthlyPremium={card.monthlyPremium}
                  premiumPaymentMode={card.premiumPaymentMode}
                  groupPremiumAmount={card.groupPremiumAmount}
                  endDate={card.endDate}
                  latestEntryMonth={card.latestEntryMonth}
                  latestEntryFundValue={card.latestEntryFundValue}
                  latestEntryPremiumsPaid={card.latestEntryPremiumsPaid}
                  monthlyData={card.monthlyData}
                  variant="summary"
                />
              ))}
            </div>
          )}
        </div>
        )
      })()}

      <div className="space-y-6">
        <Card
          className={cn(
            !hasMonthData &&
              !isCashflowLoading &&
              "border-dashed opacity-60"
          )}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Cashflow Waterfall</CardTitle>
            {effectiveMonth && (
              <p className="text-xs text-muted-foreground">
                {formatTrendMonth(effectiveMonth)}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <div className="flex flex-1 flex-col">
              {(() => {
                if (!hasMonthData && !isCashflowLoading) {
                  return (
                    <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                      No cashflow data for this month
                    </div>
                  )
                }
                if (waterfallData) return <SectionedWaterfall data={waterfallData} />
                if (effectiveMonth) return <ChartSkeleton height={300} />
                return (
                  <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                    Select a month
                  </div>
                )
              })()}
            </div>
            <CardCTA href="/dashboard/cashflow">View cashflow</CardCTA>
          </CardContent>
        </Card>

        <Card
          className={cn(
            "overflow-visible",
            !hasMonthData &&
              !isCashflowLoading &&
              "border-dashed opacity-60"
          )}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Cashflow Flow</CardTitle>
            {effectiveMonth && (
              <p className="text-xs text-muted-foreground">
                {formatTrendMonth(effectiveMonth)}
              </p>
            )}
          </CardHeader>
          <CardContent className="overflow-visible">
            <div className="flex flex-1 flex-col">
              {(() => {
                if (!hasMonthData && !isCashflowLoading) {
                  return (
                    <div className="flex h-[340px] items-center justify-center text-sm text-muted-foreground">
                      No cashflow data for this month
                    </div>
                  )
                }
                if (waterfallData) return <CashflowSankey data={waterfallData} />
                if (effectiveMonth) return <ChartSkeleton height={340} />
                return (
                  <div className="flex h-[340px] items-center justify-center text-sm text-muted-foreground">
                    Select a month above
                  </div>
                )
              })()}
            </div>
            <CardCTA href="/dashboard/cashflow">View cashflow</CardCTA>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Trading / Investment Journal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Log buys and sells with optional notes on the{" "}
              <Link
                href="/dashboard/investments"
                className="text-primary underline"
              >
                Investments
              </Link>{" "}
              page (Holdings and Activity tabs). Recent trades:
            </p>
            {isTxLoading ? (
              <Skeleton className="h-32 w-full rounded-xl" />
            ) : (
              <JournalList entries={transactions} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
