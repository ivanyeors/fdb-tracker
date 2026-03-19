"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
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
import { CpfCard } from "@/components/dashboard/cpf/cpf-card"
import { IlpCard } from "@/components/dashboard/investments/ilp-card"
import { WaterfallChart, type WaterfallData } from "@/components/dashboard/cashflow/waterfall-chart"
import { CashflowSankey } from "@/components/dashboard/cashflow/cashflow-sankey"
import { JournalList, type JournalEntry } from "@/components/dashboard/investments/journal-list"
import { JournalForm } from "@/components/dashboard/investments/journal-form"
import { MonthYearPicker } from "@/components/ui/month-year-picker"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { formatCurrency } from "@/lib/utils"
import { ChartSkeleton } from "@/components/loading"
import { Skeleton } from "@/components/ui/skeleton"

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
  end_date: string
  created_at: string
  latestEntry: { fund_value: number; month: string } | null
  entries: { month: string; fund_value: number }[]
}

export default function OverviewPage() {
  const { activeProfileId, activeFamilyId, families } = useActiveProfile()
  const [data, setData] = useState<{
    totalNetWorth?: number
    liquidNetWorth?: number
    savingsRate?: number
    bankTotal?: number
    cpfTotal?: number
    cpfBreakdown?: { oa: number; sa: number; ma: number }
    cpfDelta?: number
    investmentTotal?: number
    loanTotal?: number
    loanMonthlyTotal?: number
    loanRemainingMonths?: number
    latestInflow?: number
    latestOutflow?: number
    latestMonth?: string | null
    previousMonthInflow?: number
    previousMonthOutflow?: number
    previousMonthSavings?: number
  } | null>(null)
  const [waterfallData, setWaterfallData] = useState<WaterfallData | null>(null)
  const [cashflowMonths, setCashflowMonths] = useState<string[]>([])
  const [cashflowRangeData, setCashflowRangeData] = useState<
    Array<{ month: string; inflow: number; totalOutflow: number }>
  >([])
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [ilpProducts, setIlpProducts] = useState<IlpProductWithEntries[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [policies, setPolicies] = useState<Policy[]>([])
  const [transactions, setTransactions] = useState<JournalEntry[]>([])
  const [investmentHistory, setInvestmentHistory] = useState<
    { date: string; value: number }[]
  >([])
  const [isOverviewLoading, setIsOverviewLoading] = useState(true)
  const [isCashflowLoading, setIsCashflowLoading] = useState(true)
  const [isIlpLoading, setIsIlpLoading] = useState(true)
  const [isGoalsLoading, setIsGoalsLoading] = useState(true)
  const [isInsuranceLoading, setIsInsuranceLoading] = useState(true)
  const [isTxLoading, setIsTxLoading] = useState(true)

  const params = useMemo(() => {
    const p = new URLSearchParams()
    if (activeProfileId) p.set("profileId", activeProfileId)
    if (activeFamilyId && !activeProfileId) p.set("familyId", activeFamilyId)
    return p.toString()
  }, [activeProfileId, activeFamilyId])

  useEffect(() => {
    function fetchAll() {
      setIsOverviewLoading(true)
      setIsCashflowLoading(true)
      setIsIlpLoading(true)
      setIsGoalsLoading(true)
      setIsInsuranceLoading(true)
      setIsTxLoading(true)
      
      const qs = params ? `?${params}` : ""
      const now = new Date()
      const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
      const twelveMonthsAgo = new Date(now)
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11)
      const twelveMonthsAgoStr = `${twelveMonthsAgo.getFullYear()}-${String(twelveMonthsAgo.getMonth() + 1).padStart(2, "0")}-01`
      const familyStartMonth =
        activeFamilyId && families?.length
          ? (() => {
              const family = families.find((f) => f.id === activeFamilyId)
              if (!family?.created_at) return twelveMonthsAgoStr
              const d = new Date(family.created_at)
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
            })()
          : twelveMonthsAgoStr
      const startMonth =
        familyStartMonth > twelveMonthsAgoStr ? familyStartMonth : twelveMonthsAgoStr

      let latestMonthFromOverview: string | null = null

      fetch(`/api/overview${qs}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) {
            setData(d)
            latestMonthFromOverview = d.latestMonth ?? null
          }
          setIsOverviewLoading(false)
        })
        .catch(() => setIsOverviewLoading(false))

      fetch(`/api/cashflow?startMonth=${startMonth}&endMonth=${endMonth}${params ? `&${params}` : ""}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((cashflow) => {
          if (cashflow && Array.isArray(cashflow)) {
            setCashflowRangeData(cashflow)
            const months = cashflow.map((r: { month: string }) => r.month).reverse()
            setCashflowMonths(months)
            const preferred =
              latestMonthFromOverview && months.includes(latestMonthFromOverview)
                ? latestMonthFromOverview
                : months[0] ?? null
            setSelectedMonth((prev) => (prev ?? preferred))
          }
          setIsCashflowLoading(false)
        })
        .catch(() => setIsCashflowLoading(false))

      fetch(`/api/investments/ilp${qs}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((products) => {
          if (products) {
            setIlpProducts(
              products.map((p: IlpProductWithEntries) => ({
                ...p,
                entries: p.entries ?? [],
              })),
            )
          }
          setIsIlpLoading(false)
        })
        .catch(() => setIsIlpLoading(false))

      fetch(`/api/goals${qs}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json) setGoals(json)
          setIsGoalsLoading(false)
        })
        .catch(() => setIsGoalsLoading(false))

      fetch(`/api/insurance${qs}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json) setPolicies(json)
          setIsInsuranceLoading(false)
        })
        .catch(() => setIsInsuranceLoading(false))

      fetch(`/api/investments/transactions${qs ? `${qs}&limit=100` : "?limit=100"}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((txs) => {
          if (txs) {
            setTransactions(
              txs.map(
              (t: {
                id: string
                symbol: string
                type: string
                quantity: number
                price: number
                journal_text?: string
                created_at: string
              }) => ({
                id: t.id,
                symbol: t.symbol,
                type: t.type as "buy" | "sell",
                quantity: t.quantity,
                price: t.price,
                journalText: t.journal_text,
                date: t.created_at.slice(0, 10),
              })),
            )
          }
          setIsTxLoading(false)
        })
        .catch(() => setIsTxLoading(false))

      if (qs) {
        fetch(`/api/investments/history?days=30${qs.replace("?", "&")}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => {
            if (json?.data) setInvestmentHistory(json.data)
          })
          .catch(() => setInvestmentHistory([]))
      } else {
        setInvestmentHistory([])
      }
    }
    fetchAll()
  }, [params, activeFamilyId, families])

  useEffect(() => {
    if (!selectedMonth || (!activeProfileId && !activeFamilyId)) return
    const qs = params ? `?${params}&month=${selectedMonth}` : `?month=${selectedMonth}`
    setIsOverviewLoading(true)
    fetch(`/api/overview${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setData(d)
        setIsOverviewLoading(false)
      })
      .catch(() => setIsOverviewLoading(false))
  }, [selectedMonth, params, activeProfileId, activeFamilyId])

  useEffect(() => {
    if (!selectedMonth || (!activeProfileId && !activeFamilyId)) return
    fetch(`/api/cashflow?month=${selectedMonth}${params ? `&${params}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json) setWaterfallData(json)
      })
      .catch(() => setWaterfallData(null))
  }, [selectedMonth, params, activeProfileId, activeFamilyId])

  const savingsHistory = useMemo(() => {
    return cashflowRangeData.map((r) => ({
      month: r.month,
      value: r.inflow - r.totalOutflow,
    }))
  }, [cashflowRangeData])

  const savingsTrend = useMemo(() => {
    const savingsThisMonth = (data?.latestInflow ?? 0) - (data?.latestOutflow ?? 0)
    const prevSavings = data?.previousMonthSavings
    if (prevSavings !== undefined && prevSavings !== null) {
      if (Math.abs(prevSavings) === 0) return 0
      return ((savingsThisMonth - prevSavings) / Math.abs(prevSavings)) * 100
    }
    if (savingsHistory.length < 2) return 0
    const current = savingsHistory[savingsHistory.length - 1]?.value ?? 0
    const previous = savingsHistory[savingsHistory.length - 2]?.value ?? 0
    if (previous === 0) return 0
    return ((current - previous) / Math.abs(previous)) * 100
  }, [data?.latestInflow, data?.latestOutflow, data?.previousMonthSavings, savingsHistory])

  const investmentMonthlyData = useMemo((): { month: string; value: number }[] => {
    const investmentTotal = data?.investmentTotal ?? 0
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
      0,
    )
    const nonIlp = Math.max(0, investmentTotal - currentIlpTotal)
    const allMonths = Array.from(ilpTotalByMonth.keys()).sort()
    if (allMonths.length === 0 && investmentTotal > 0) {
      const now = new Date()
      const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
      return [
        {
          month: new Date(m + "-01").toLocaleString("en-US", { month: "short" }),
          value: investmentTotal,
        },
      ]
    }
    return allMonths.map((monthKey) => {
      const ilpVal = ilpTotalByMonth.get(monthKey) ?? 0
      return {
        month: new Date(monthKey + "-01").toLocaleString("en-US", { month: "short" }),
        value: ilpVal + nonIlp,
      }
    })
  }, [ilpProducts, data?.investmentTotal])

  const ilpCardsData = useMemo(() => {
    return ilpProducts.map((p) => {
      const fundValue = p.latestEntry?.fund_value ?? 0
      const startDate = new Date(p.created_at)
      const now = new Date()
      const monthsPaid = Math.max(
        0,
        Math.floor(
          (now.getFullYear() - startDate.getFullYear()) * 12 +
            (now.getMonth() - startDate.getMonth()),
        ),
      )
      const totalPremiumsPaid = p.monthly_premium * Math.max(1, monthsPaid)
      const returnPct =
        totalPremiumsPaid > 0
          ? ((fundValue - totalPremiumsPaid) / totalPremiumsPaid) * 100
          : 0
      const sortedEntries = [...(p.entries ?? [])].sort((a, b) =>
        a.month.localeCompare(b.month),
      )
      let monthlyData = sortedEntries.map((e) => ({
        month: new Date(e.month + "-01").toLocaleString("en-US", {
          month: "short",
        }),
        value: e.fund_value,
      }))
      if (monthlyData.length === 0 && fundValue > 0) {
        monthlyData = [
          {
            month: new Date().toLocaleString("en-US", { month: "short" }),
            value: fundValue,
          },
        ]
      }
      return {
        productId: p.id,
        name: p.name,
        fundValue,
        totalPremiumsPaid,
        returnPct,
        monthlyPremium: p.monthly_premium,
        endDate: p.end_date,
        monthlyData,
      }
    })
  }, [ilpProducts])

  const investmentTrend = useMemo(() => {
    if (investmentHistory.length >= 2) {
      const first = investmentHistory[0]?.value ?? 0
      const last = investmentHistory[investmentHistory.length - 1]?.value ?? 0
      if (first === 0) return 0
      return ((last - first) / first) * 100
    }
    if (investmentMonthlyData.length < 2) return 0
    const current = investmentMonthlyData[investmentMonthlyData.length - 1]?.value ?? 0
    const previous = investmentMonthlyData[investmentMonthlyData.length - 2]?.value ?? 0
    if (previous === 0) return 0
    return ((current - previous) / previous) * 100
  }, [investmentHistory, investmentMonthlyData])

  const goalsSummary = useMemo(() => {
    const totalSaved = goals.reduce((sum, g) => sum + g.current_amount, 0)
    const totalTarget = goals.reduce((sum, g) => sum + g.target_amount, 0)
    const progress = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0
    return { totalSaved, totalTarget, progress }
  }, [goals])

  const totalInsuranceCoverage = useMemo(
    () =>
      policies
        .filter((p) => p.is_active)
        .reduce((sum, p) => sum + (p.coverage_amount ?? 0), 0),
    [policies],
  )

  const refreshIlp = () => {
    const qs = params ? `?${params}` : ""
    fetch(`/api/investments/ilp${qs}`)
      .then((r) => r.ok && r.json())
      .then((products) => {
        if (products)
          setIlpProducts(
            products.map((p: IlpProductWithEntries) => ({
              ...p,
              entries: p.entries ?? [],
            })),
          )
      })
  }

  const refreshTransactions = () => {
    const qs = params ? `?${params}` : ""
    fetch(`/api/investments/transactions${qs ? `${qs}&limit=100` : "?limit=100"}`)
      .then((r) => r.ok && r.json())
      .then((txs) => {
        if (txs) {
          setTransactions(
            txs.map(
              (t: {
                id: string
                symbol: string
                type: string
                quantity: number
                price: number
                journal_text?: string
                created_at: string
              }) => ({
                id: t.id,
                symbol: t.symbol,
                type: t.type as "buy" | "sell",
                quantity: t.quantity,
                price: t.price,
                journalText: t.journal_text,
                date: t.created_at.slice(0, 10),
              }),
            ),
          )
        }
      })
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Overview"
        description="Net worth, savings rate, and key metrics at a glance."
      >
        <MonthYearPicker
          value={selectedMonth}
          onChange={setSelectedMonth}
          availableMonths={cashflowMonths}
          placeholder="Select month"
        />
      </SectionHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Inflow / Outflow</CardTitle>
            <p className="text-xs text-muted-foreground">
              {isOverviewLoading
                ? ""
                : (selectedMonth ?? data?.latestMonth)
                  ? formatTrendMonth(selectedMonth ?? data?.latestMonth ?? "")
                  : "Latest month"}
            </p>
          </CardHeader>
          <CardContent>
            {isOverviewLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
              </div>
            ) : (
              <>
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Inflow
                    </span>
                    <span className="font-medium">
                      ${formatCurrency(data?.latestInflow ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Outflow
                    </span>
                    <span className="font-medium">
                      ${formatCurrency(data?.latestOutflow ?? 0)}
                    </span>
                  </div>
                </div>
                <CardCTA href="/dashboard/cashflow">View cashflow</CardCTA>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Savings Goals</CardTitle>
          </CardHeader>
          <CardContent>
            {isGoalsLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : goals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No savings goals. Create one in Savings Goals.
              </p>
            ) : (
              <>
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Saved
                    </span>
                    <span className="font-medium">
                      ${formatCurrency(goalsSummary.totalSaved)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Target
                    </span>
                    <span className="font-medium">
                      ${formatCurrency(goalsSummary.totalTarget)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Progress
                    </span>
                    <span className="font-medium">
                      {goalsSummary.progress.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <CardCTA href="/dashboard/goals">View goals</CardCTA>
              </>
            )}
          </CardContent>
        </Card>

        <SavingsThisMonthCard
          savingsThisMonth={(data?.latestInflow ?? 0) - (data?.latestOutflow ?? 0)}
          trend={savingsTrend}
          savingsHistory={savingsHistory}
          latestMonth={selectedMonth ?? data?.latestMonth ?? null}
          loading={isOverviewLoading || isCashflowLoading}
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
          trend={investmentTrend}
          monthlyData={investmentMonthlyData}
          dailyData={investmentHistory}
          loading={isOverviewLoading}
        />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Insurance Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            {isInsuranceLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : policies.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No insurance policies. Add in Insurance.
              </p>
            ) : (
              <>
                <div className="flex flex-1 flex-col">
                  <p className="text-2xl font-bold tracking-tight">
                    ${formatCurrency(totalInsuranceCoverage)}
                  </p>
                </div>
                <CardCTA href="/dashboard/insurance">View policies</CardCTA>
              </>
            )}
          </CardContent>
        </Card>
      </div>

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
                  {(data?.loanTotal ?? 0) > 0 &&
                  (data?.loanRemainingMonths ?? 0) > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {(() => {
                        const months = data?.loanRemainingMonths ?? 0
                        const years = Math.floor(months / 12)
                        const m = months % 12
                        return years > 0 ? `${years}y ${m}m left` : `${m}m left`
                      })()}
                    </p>
                  ) : (data?.loanTotal ?? 0) === 0 ? null : (
                    <p className="text-sm text-muted-foreground">Paid off</p>
                  )}
                </div>
                <CardCTA href="/dashboard/loans">View all</CardCTA>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {isIlpLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : ilpCardsData.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">ILP Performance</h3>
            <Link
              href="/dashboard/investments/detail"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              View in Investments
              <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {ilpCardsData.map((card) => (
              <IlpCard
                key={card.productId}
                productId={card.productId}
                name={card.name}
                fundValue={card.fundValue}
                totalPremiumsPaid={card.totalPremiumsPaid}
                returnPct={card.returnPct}
                monthlyPremium={card.monthlyPremium}
                endDate={card.endDate}
                monthlyData={card.monthlyData}
                onAddEntry={refreshIlp}
                onEditSuccess={refreshIlp}
              />
            ))}
          </div>
        </div>
      ) : (activeProfileId || activeFamilyId) ? (
        <div className="rounded-lg border bg-card p-4 text-center text-sm text-muted-foreground">
          No ILP plans. Add one in{" "}
          <Link href="/dashboard/investments/detail" className="text-primary hover:underline">
            Investments
          </Link>
          .
        </div>
      ) : null}

      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Cashflow Waterfall</CardTitle>
            {selectedMonth && (
              <p className="text-xs text-muted-foreground">
                {formatTrendMonth(selectedMonth)}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <div className="flex flex-1 flex-col">
              {waterfallData ? (
                <WaterfallChart data={waterfallData} />
              ) : selectedMonth ? (
                <ChartSkeleton height={300} />
              ) : (
                <div className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
                  Select a month
                </div>
              )}
            </div>
            <CardCTA href="/dashboard/cashflow">View cashflow</CardCTA>
          </CardContent>
        </Card>

        <Card className="overflow-visible">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Cashflow Flow</CardTitle>
            {selectedMonth && (
              <p className="text-xs text-muted-foreground">
                {formatTrendMonth(selectedMonth)}
              </p>
            )}
          </CardHeader>
          <CardContent className="overflow-visible">
            <div className="flex flex-1 flex-col">
              {waterfallData ? (
                <CashflowSankey data={waterfallData} />
              ) : selectedMonth ? (
                <ChartSkeleton height={340} />
              ) : (
                <div className="flex h-[340px] items-center justify-center text-muted-foreground text-sm">
                  Select a month above
                </div>
              )}
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
          <CardContent className="space-y-6 pt-4">
            {isTxLoading ? (
              <Skeleton className="h-32 w-full rounded-xl" />
            ) : (
              <JournalList entries={transactions} />
            )}
            <div className="rounded-xl border p-4">
              <h3 className="mb-4 text-sm font-medium">Add Journal Entry</h3>
              <JournalForm onSuccess={refreshTransactions} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
