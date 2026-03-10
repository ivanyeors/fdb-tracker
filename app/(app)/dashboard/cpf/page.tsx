"use client"

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

const mockContributions = [
  { month: "Jul", oa: 1380, sa: 360, ma: 1160 },
  { month: "Aug", oa: 1380, sa: 360, ma: 1160 },
  { month: "Sep", oa: 1380, sa: 360, ma: 1160 },
  { month: "Oct", oa: 1380, sa: 360, ma: 1160 },
  { month: "Nov", oa: 1380, sa: 360, ma: 1160 },
  { month: "Dec", oa: 1380, sa: 360, ma: 1160 },
]

const BRS = 110200
const FRS = 220400
const ERS = 440800
const cpfSA = 15000

const mockProjection = Array.from({ length: 26 }, (_, i) => ({
  year: 2026 + i,
  balance: Math.round(cpfSA * Math.pow(1.04, i) + 4320 * i * 1.02),
}))

const retirementBenchmarks = [
  { label: "BRS", target: BRS, pct: Math.round((cpfSA / BRS) * 100) },
  { label: "FRS", target: FRS, pct: Math.round((cpfSA / FRS) * 100) },
  { label: "ERS", target: ERS, pct: Math.round((cpfSA / ERS) * 100) },
]

function OverviewTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          label="Ordinary Account (OA)"
          value="45,000"
          prefix="$"
          tooltipId="CPF_OA_SA_MA"
        />
        <MetricCard
          label="Special Account (SA)"
          value="15,000"
          prefix="$"
          tooltipId="CPF_OA_SA_MA"
        />
        <MetricCard
          label="Medisave Account (MA)"
          value="20,000"
          prefix="$"
          tooltipId="CPF_OA_SA_MA"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Contributions (OA / SA / MA)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={mockContributions}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="month"
                className="text-xs"
                tick={{ fill: "var(--color-muted-foreground)" }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: "var(--color-muted-foreground)" }}
                tickFormatter={(v: number) => `$${v}`}
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
                fill="var(--color-chart-1)"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="sa"
                name="SA"
                stackId="cpf"
                fill="var(--color-chart-3)"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="ma"
                name="MA"
                stackId="cpf"
                fill="var(--color-chart-5)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}

function HousingTab() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <MetricCard
        label="CPF OA Used"
        value="120,000"
        prefix="$"
        tooltipId="CPF_HOUSING_REFUND"
      />
      <MetricCard
        label="Accrued Interest"
        value="15,000"
        prefix="$"
        tooltipId="CPF_HOUSING_REFUND"
      />
      <MetricCard
        label="Total Refund Due"
        value="135,000"
        prefix="$"
        tooltipId="CPF_HOUSING_REFUND"
      />
      <MetricCard
        label="120% VL Remaining"
        value="45,000"
        prefix="$"
        tooltipId="CPF_HOUSING_REFUND"
      />
    </div>
  )
}

function LoansTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>HDB Housing Loan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">CPF Portion</p>
              <p className="text-xl font-bold">$120,000</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Cash Portion</p>
              <p className="text-xl font-bold">$80,000</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Outstanding Balance
              </p>
              <p className="text-xl font-bold">$185,000</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Monthly Payment</p>
              <p className="text-xl font-bold">$1,200</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function RetirementTab() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {retirementBenchmarks.map((b) => (
          <Card key={b.label}>
            <CardContent className="pt-1">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">
                  {b.label} (${b.target.toLocaleString()})
                </p>
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
          <CardTitle>CPF SA Growth Projection (25 Years)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={mockProjection}>
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
                stroke="var(--color-chart-1)"
                strokeDasharray="6 3"
                label={{ value: "BRS", fill: "var(--color-chart-1)", fontSize: 12 }}
              />
              <ReferenceLine
                y={FRS}
                stroke="var(--color-chart-3)"
                strokeDasharray="6 3"
                label={{ value: "FRS", fill: "var(--color-chart-3)", fontSize: 12 }}
              />
              <ReferenceLine
                y={ERS}
                stroke="var(--color-chart-5)"
                strokeDasharray="6 3"
                label={{ value: "ERS", fill: "var(--color-chart-5)", fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="balance"
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}

export default function CpfPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="CPF"
        description="OA/SA/MA balances, housing, and retirement benchmarking."
      />

      <Tabs defaultValue="overview">
        <div className="-mx-1 overflow-x-auto [overscroll-behavior-x:contain] [-webkit-overflow-scrolling:touch]">
          <TabsList className="inline-flex w-fit flex-nowrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="housing">Housing</TabsTrigger>
          <TabsTrigger value="loans">Loans</TabsTrigger>
          <TabsTrigger value="retirement">Retirement</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="housing" className="mt-4">
          <HousingTab />
        </TabsContent>
        <TabsContent value="loans" className="mt-4">
          <LoansTab />
        </TabsContent>
        <TabsContent value="retirement" className="mt-4">
          <RetirementTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
