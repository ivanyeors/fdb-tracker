"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricCard } from "@/components/dashboard/metric-card"
import { SectionHeader } from "@/components/dashboard/section-header"
import { IlpCard } from "@/components/dashboard/investments/ilp-card"
import { WaterfallChart, type WaterfallData } from "@/components/dashboard/cashflow/waterfall-chart"
import { CashflowSankey } from "@/components/dashboard/cashflow/cashflow-sankey"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { formatCurrency } from "@/lib/utils"

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

type IlpProductWithEntries = {
  id: string
  name: string
  monthly_premium: number
  end_date: string
  created_at: string
  latestEntry: { fund_value: number; month: string } | null
  entries: { month: string; fund_value: number }[]
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

export default function OverviewPage() {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [data, setData] = useState<{
    totalNetWorth?: number
    liquidNetWorth?: number
    savingsRate?: number
    bankTotal?: number
    cpfTotal?: number
    investmentTotal?: number
    loanTotal?: number
    latestInflow?: number
    latestOutflow?: number
    latestMonth?: string | null
  } | null>(null)
  const [waterfallData, setWaterfallData] = useState<WaterfallData | null>(null)
  const [cashflowMonths, setCashflowMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [ilpProducts, setIlpProducts] = useState<IlpProductWithEntries[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [policies, setPolicies] = useState<Policy[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const params = useMemo(() => {
    const p = new URLSearchParams()
    if (activeProfileId) p.set("profileId", activeProfileId)
    if (activeFamilyId && !activeProfileId) p.set("familyId", activeFamilyId)
    return p.toString()
  }, [activeProfileId, activeFamilyId])

  useEffect(() => {
    async function fetchAll() {
      setIsLoading(true)
      try {
        const qs = params ? `?${params}` : ""
        const now = new Date()
        const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
        now.setMonth(now.getMonth() - 11)
        const startMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`

        const [overviewRes, cashflowRes, ilpRes, goalsRes, insuranceRes] =
          await Promise.all([
            fetch(`/api/overview${qs}`),
            fetch(
              `/api/cashflow?startMonth=${startMonth}&endMonth=${endMonth}${params ? `&${params}` : ""}`,
            ),
            fetch(`/api/investments/ilp${qs}`),
            fetch(`/api/goals${qs}`),
            fetch(`/api/insurance${qs}`),
          ])
        if (overviewRes.ok) {
          const json = await overviewRes.json()
          setData(json)
        }
        if (cashflowRes.ok) {
          const cashflow = await cashflowRes.json()
          const months = Array.isArray(cashflow)
            ? cashflow.map((r: { month: string }) => r.month).reverse()
            : []
          setCashflowMonths(months)
          setSelectedMonth((prev) => (prev ?? months[0] ?? null))
        }
        if (ilpRes.ok) {
          const products = await ilpRes.json()
          setIlpProducts(
            (products ?? []).map((p: IlpProductWithEntries) => ({
              ...p,
              entries: p.entries ?? [],
            })),
          )
        }
        if (goalsRes.ok) {
          const json = await goalsRes.json()
          setGoals(json ?? [])
        }
        if (insuranceRes.ok) {
          const json = await insuranceRes.json()
          setPolicies(json ?? [])
        }
      } catch (error) {
        console.error("Failed to fetch overview:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchAll()
  }, [params])

  useEffect(() => {
    if (!selectedMonth || (!activeProfileId && !activeFamilyId)) return
    fetch(`/api/cashflow?month=${selectedMonth}${params ? `&${params}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json) setWaterfallData(json)
      })
      .catch(() => setWaterfallData(null))
  }, [selectedMonth, params, activeProfileId, activeFamilyId])

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
        monthlyData,
      }
    })
  }, [ilpProducts])

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

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Overview"
        description="Net worth, savings rate, and key metrics at a glance."
      />

      {isLoading ? (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
          Loading metrics...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <MetricCard
              label="Total Net Worth"
              value={data?.totalNetWorth ?? 0}
              prefix="$"
              trend={0}
              trendLabel="vs last month"
              tooltipId="NET_WORTH"
            />
            <MetricCard
              label="Liquid Net Worth"
              value={data?.liquidNetWorth ?? 0}
              prefix="$"
              trend={0}
              trendLabel="vs last month"
              tooltipId="LIQUID_NET_WORTH"
            />
            <MetricCard
              label="Savings Rate"
              value={data?.savingsRate || 0}
              suffix="%"
              trend={0}
              trendLabel="vs last month"
              tooltipId="SAVINGS_RATE"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Bank Total"
              value={data?.bankTotal ?? 0}
              prefix="$"
              trend={0}
              trendLabel="vs last month"
            />
            <MetricCard
              label="CPF Total"
              value={data?.cpfTotal ?? 0}
              prefix="$"
              trend={0}
              trendLabel="vs last month"
            />
            <MetricCard
              label="Investments"
              value={data?.investmentTotal ?? 0}
              prefix="$"
              trend={0}
              trendLabel="vs last month"
            />
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  Loans Outstanding
                </p>
                <p className="mt-1 text-2xl font-bold tracking-tight">
                  ${formatCurrency(data?.loanTotal ?? 0)}
                </p>
                <Link
                  href="/dashboard/loans"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  View all
                  <ArrowRight className="size-4" />
                </Link>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Inflow / Outflow</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {data?.latestMonth
                    ? formatTrendMonth(data.latestMonth)
                    : "Latest month"}
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
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
                <Link
                  href="/dashboard/cashflow"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  View cashflow
                  <ArrowRight className="size-4" />
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Savings Goals</CardTitle>
              </CardHeader>
              <CardContent>
                {goals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No savings goals. Create one in Savings Goals.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-col gap-2">
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
                    <Link
                      href="/dashboard/goals"
                      className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      View goals
                      <ArrowRight className="size-4" />
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Insurance Coverage</CardTitle>
              </CardHeader>
              <CardContent>
                {policies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No insurance policies. Add in Insurance.
                  </p>
                ) : (
                  <>
                    <p className="text-2xl font-bold tracking-tight">
                      ${formatCurrency(totalInsuranceCoverage)}
                    </p>
                    <Link
                      href="/dashboard/insurance"
                      className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      View policies
                      <ArrowRight className="size-4" />
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {ilpCardsData.length > 0 && (
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
                    monthlyData={card.monthlyData}
                    onAddEntry={refreshIlp}
                  />
                ))}
              </div>
            </div>
          )}

          {!isLoading && ilpProducts.length === 0 && (activeProfileId || activeFamilyId) && (
            <div className="rounded-lg border bg-card p-4 text-center text-sm text-muted-foreground">
              No ILP plans. Add one in{" "}
              <Link href="/dashboard/investments/detail" className="text-primary hover:underline">
                Investments
              </Link>
              .
            </div>
          )}
        </>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Cashflow Waterfall</CardTitle>
          <Select
            value={selectedMonth ?? ""}
            onValueChange={(v) => setSelectedMonth(v || null)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {cashflowMonths.map((m) => {
                const [y, mo] = m.split("-")
                return (
                  <SelectItem key={m} value={m}>
                    {formatTrendMonth(`${y}-${mo}`)}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {waterfallData ? (
            <>
              <WaterfallChart data={waterfallData} />
              <div className="mt-6">
                <h4 className="mb-3 text-sm font-medium text-muted-foreground">
                  Cashflow Flow
                </h4>
                <CashflowSankey data={waterfallData} />
              </div>
            </>
          ) : (
            <div className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
              {selectedMonth ? "Loading..." : "Select a month"}
            </div>
          )}
          <Link
            href="/dashboard/cashflow"
            className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            View cashflow
            <ArrowRight className="size-4" />
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
