"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricCard } from "@/components/dashboard/metric-card"
import { SectionHeader } from "@/components/dashboard/section-header"

const mockNetWorthTrend = [
  { month: "Jan", value: 210000 },
  { month: "Feb", value: 215000 },
  { month: "Mar", value: 218000 },
  { month: "Apr", value: 222000 },
  { month: "May", value: 220000 },
  { month: "Jun", value: 225000 },
  { month: "Jul", value: 228000 },
  { month: "Aug", value: 232000 },
  { month: "Sep", value: 235000 },
  { month: "Oct", value: 238000 },
  { month: "Nov", value: 241000 },
  { month: "Dec", value: 245000 },
]

export default function OverviewPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Overview"
        description="Net worth, savings rate, and key metrics at a glance."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          label="Total Net Worth"
          value="245,000"
          prefix="$"
          trend={3.2}
          trendLabel="vs last month"
          tooltipId="NET_WORTH"
        />
        <MetricCard
          label="Liquid Net Worth"
          value="165,000"
          prefix="$"
          trend={2.5}
          trendLabel="vs last month"
          tooltipId="LIQUID_NET_WORTH"
        />
        <MetricCard
          label="Savings Rate"
          value={34}
          suffix="%"
          trend={1.8}
          trendLabel="vs last month"
          tooltipId="SAVINGS_RATE"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Bank Total"
          value="85,000"
          prefix="$"
          trend={1.4}
          trendLabel="vs last month"
        />
        <MetricCard
          label="CPF Total"
          value="80,000"
          prefix="$"
          trend={2.1}
          trendLabel="vs last month"
        />
        <MetricCard
          label="Investments"
          value="45,000"
          prefix="$"
          trend={-0.8}
          trendLabel="vs last month"
        />
        <MetricCard
          label="Loans Outstanding"
          value="35,000"
          prefix="$"
          trend={-1.2}
          trendLabel="vs last month"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Net Worth Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={mockNetWorthTrend}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="month"
                className="text-xs"
                tick={{ fill: "var(--color-muted-foreground)" }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: "var(--color-muted-foreground)" }}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(v) => [`$${Number(v).toLocaleString()}`, "Net Worth"]}
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
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
