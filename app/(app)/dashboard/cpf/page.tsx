"use client"

import { useState, useEffect, useMemo } from "react"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { MetricCard } from "@/components/dashboard/metric-card"
import { SectionHeader } from "@/components/dashboard/section-header"
import { formatCurrency } from "@/lib/utils"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { useActiveProfile } from "@/hooks/use-active-profile"

const BRS = 110200
const FRS = 220400
const ERS = 440800

type CpfBalanceRow = { month: string; oa: number; sa: number; ma: number }

type HousingData = {
  oaUsed: number
  accruedInterest: number
  refundDue: number
  vlRemaining: number
}

type LoanRow = {
  id: string
  name: string
  type: string
  principal: number
  rate_pct: number
  tenure_months: number
  start_date: string
  lender: string | null
  use_cpf_oa: boolean
}

type RetirementData = {
  currentCpf: { oa: number; sa: number; ma: number; total: number }
  retirementSums: { brs: number; frs: number; ers: number }
  extendedProjection: { year: number; oa: number; sa: number; ma: number; total: number }[]
}

function computeMonthlyPayment(principal: number, ratePct: number, tenureMonths: number): number {
  if (tenureMonths <= 0) return 0
  const r = ratePct / 100 / 12
  if (r <= 0) return principal / tenureMonths
  return (principal * r * Math.pow(1 + r, tenureMonths)) / (Math.pow(1 + r, tenureMonths) - 1)
}

function OverviewTab({ data }: { data: CpfBalanceRow[] }) {
  const latest = data[data.length - 1] || { oa: 0, sa: 0, ma: 0 }

  const chartData = useMemo(() => {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return [...data]
      .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime())
      .slice(-6)
      .map((d) => {
        const date = new Date(d.month)
        return {
          ...d,
          month: `${monthNames[date.getMonth()]} ${date.getFullYear()}`,
        }
      })
  }, [data])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          label="Ordinary Account (OA)"
          value={latest.oa}
          prefix="$"
          tooltipId="CPF_OA_SA_MA"
        />
        <MetricCard
          label="Special Account (SA)"
          value={latest.sa}
          prefix="$"
          tooltipId="CPF_OA_SA_MA"
        />
        <MetricCard
          label="Medisave Account (MA)"
          value={latest.ma}
          prefix="$"
          tooltipId="CPF_OA_SA_MA"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Contribution Projections (6 Months)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="month"
                className="text-xs"
                tick={{ fill: "var(--color-muted-foreground)" }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: "var(--color-muted-foreground)" }}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
              />
              <Tooltip
                formatter={(v, name) => [
                  `$${Number(v).toLocaleString()}`,
                  String(name).toUpperCase(),
                ]}
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                }}
              />
              <Legend />
              <Bar
                dataKey="oa"
                name="OA"
                stackId="cpf"
                fill="var(--color-chart-neutral)"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="sa"
                name="SA"
                stackId="cpf"
                fill="var(--color-chart-neutral)"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="ma"
                name="MA"
                stackId="cpf"
                fill="var(--color-chart-neutral)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}

function HousingTab({ data }: { data: HousingData | null }) {
  const oaUsed = data?.oaUsed ?? 0
  const accruedInterest = data?.accruedInterest ?? 0
  const refundDue = data?.refundDue ?? 0
  const vlRemaining = data?.vlRemaining ?? 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <MetricCard
          label="CPF OA Used"
          value={oaUsed}
          prefix="$"
          tooltipId="CPF_HOUSING_REFUND"
        />
        <MetricCard
          label="Accrued Interest"
          value={accruedInterest}
          prefix="$"
          tooltipId="CPF_HOUSING_REFUND"
        />
        <MetricCard
          label="Total Refund Due"
          value={refundDue}
          prefix="$"
          tooltipId="CPF_HOUSING_REFUND"
        />
        <MetricCard
          label="120% VL Remaining"
          value={vlRemaining}
          prefix="$"
          tooltipId="CPF_HOUSING_REFUND"
        />
      </div>
    </div>
  )
}

function LoansTab({ loans }: { loans: LoanRow[] }) {
  const cpfLoans = loans.filter((l) => l.use_cpf_oa)

  if (cpfLoans.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
        No loans using CPF OA.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {cpfLoans.map((loan) => {
        const monthlyPayment = computeMonthlyPayment(loan.principal, loan.rate_pct, loan.tenure_months)
        return (
          <Card key={loan.id}>
            <CardHeader>
              <CardTitle>{loan.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Principal</p>
                  <p className="text-xl font-bold">${formatCurrency(loan.principal)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Monthly Payment</p>
                  <p className="text-xl font-bold">${formatCurrency(monthlyPayment)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Rate</p>
                  <p className="text-xl font-bold">{loan.rate_pct}%</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tenure</p>
                  <p className="text-xl font-bold">{loan.tenure_months} months</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function RetirementTab({ data }: { data: RetirementData | null }) {
  const cpfTotal = data?.currentCpf.total ?? 0
  const retirementSums = data?.retirementSums ?? { brs: BRS, frs: FRS, ers: ERS }
  const retirementBenchmarks = [
    { label: "BRS", fullLabel: "Basic Retirement Sum", target: retirementSums.brs, pct: Math.round((cpfTotal / retirementSums.brs) * 100), tooltipId: "CPF_BRS" as const },
    { label: "FRS", fullLabel: "Full Retirement Sum", target: retirementSums.frs, pct: Math.round((cpfTotal / retirementSums.frs) * 100), tooltipId: "CPF_FRS" as const },
    { label: "ERS", fullLabel: "Enhanced Retirement Sum", target: retirementSums.ers, pct: Math.round((cpfTotal / retirementSums.ers) * 100), tooltipId: "CPF_ERS" as const },
  ]

  const chartData = useMemo(() => {
    const proj = data?.extendedProjection ?? []
    return proj.map((p) => ({ year: p.year, balance: p.total }))
  }, [data?.extendedProjection])

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {retirementBenchmarks.map((b) => (
          <Card key={b.label}>
            <CardContent className="pt-1">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium">
                    {b.label} ({b.fullLabel}) — ${formatCurrency(b.target)}
                  </p>
                  <InfoTooltip id={b.tooltipId} />
                </div>
                <span className="text-sm font-bold tabular-nums">
                  {b.pct}%
                </span>
              </div>
              <Progress value={Math.min(b.pct, 100)} className="h-2" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-1.5">
            <CardTitle>CPF Growth Projection</CardTitle>
            <InfoTooltip id="CPF_RETIREMENT_PROJECTION" />
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
              No projection data. Add income in Settings to see projections.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="year"
                  className="text-xs"
                  tick={{ fill: "var(--color-muted-foreground)" }}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fill: "var(--color-muted-foreground)" }}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(v) => [
                    `$${Number(v).toLocaleString()}`,
                    "Projected Balance",
                  ]}
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                  }}
                />
                <ReferenceLine
                  y={BRS}
                  stroke="var(--color-chart-neutral)"
                  strokeDasharray="6 3"
                  label={{ value: "BRS (Basic Retirement Sum)", fill: "var(--color-chart-neutral)", fontSize: 12 }}
                />
                <ReferenceLine
                  y={FRS}
                  stroke="var(--color-chart-neutral)"
                  strokeDasharray="6 3"
                  label={{ value: "FRS (Full Retirement Sum)", fill: "var(--color-chart-neutral)", fontSize: 12 }}
                />
                <ReferenceLine
                  y={ERS}
                  stroke="var(--color-chart-neutral)"
                  strokeDasharray="6 3"
                  label={{ value: "ERS (Enhanced Retirement Sum)", fill: "var(--color-chart-neutral)", fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke="var(--color-chart-neutral)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function CpfPage() {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [cpfData, setCpfData] = useState<CpfBalanceRow[]>([])
  const [housingData, setHousingData] = useState<HousingData | null>(null)
  const [loansData, setLoansData] = useState<LoanRow[]>([])
  const [retirementData, setRetirementData] = useState<RetirementData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  useEffect(() => {
    async function fetchAll() {
      if (!activeProfileId && !activeFamilyId) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const params = new URLSearchParams()
        if (activeProfileId) params.set("profileId", activeProfileId)
        else if (activeFamilyId) params.set("familyId", activeFamilyId)
        const qs = params.toString()
        const [balancesRes, housingRes, loansRes, retirementRes] = await Promise.all([
          fetch(`/api/cpf/balances?${qs}`),
          fetch(`/api/cpf/housing?${qs}`),
          fetch(`/api/loans?${qs}`),
          fetch(`/api/cpf/retirement?${qs}`),
        ])

        if (balancesRes.ok) {
          const json = await balancesRes.json()
          setCpfData(json || [])
        }
        if (housingRes.ok) {
          const json = await housingRes.json()
          setHousingData(json)
        }
        if (loansRes.ok) {
          const json = await loansRes.json()
          setLoansData(json || [])
        }
        if (retirementRes.ok) {
          const json = await retirementRes.json()
          setRetirementData(json)
        }
      } catch (error) {
        console.error("Failed to fetch CPF data:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchAll()
  }, [activeProfileId, activeFamilyId])

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="CPF"
        description="OA/SA/MA balances, housing, and retirement benchmarking."
      />

      {isLoading ? (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
          Loading CPF data...
        </div>
      ) : (
        <Tabs defaultValue="overview">
          <div className="-mx-1 min-w-0 overflow-x-auto no-scrollbar [overscroll-behavior-x:contain] [-webkit-overflow-scrolling:touch]">
            <TabsList className="inline-flex w-fit flex-nowrap">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="housing">Housing Loan</TabsTrigger>
              <TabsTrigger value="retirement">Retirement</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab data={cpfData} />
          </TabsContent>
          <TabsContent value="housing" className="mt-4 space-y-6">
            <HousingTab data={housingData} />
            <SectionHeader title="Active CPF Loans" />
            <LoansTab loans={loansData} />
          </TabsContent>
          <TabsContent value="retirement" className="mt-4">
            <RetirementTab data={retirementData} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
