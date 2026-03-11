"use client"

import { useState, useEffect } from "react"
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
import { useActiveProfile } from "@/hooks/use-active-profile"

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
  const { activeProfileId } = useActiveProfile()
  const [data, setData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchOverview() {
      setIsLoading(true)
      try {
        const url = new URL("/api/overview", window.location.origin)
        if (activeProfileId) {
          url.searchParams.set("profileId", activeProfileId)
        }
        const res = await fetch(url)
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }
      } catch (error) {
        console.error("Failed to fetch overview:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchOverview()
  }, [activeProfileId])

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
              value={data?.totalNetWorth?.toLocaleString() || "0"}
              prefix="$"
              trend={0}
              trendLabel="vs last month"
              tooltipId="NET_WORTH"
            />
            <MetricCard
              label="Liquid Net Worth"
              value={data?.liquidNetWorth?.toLocaleString() || "0"}
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
              value={data?.bankTotal?.toLocaleString() || "0"}
              prefix="$"
              trend={0}
              trendLabel="vs last month"
            />
            <MetricCard
              label="CPF Total"
              value={data?.cpfTotal?.toLocaleString() || "0"}
              prefix="$"
              trend={0}
              trendLabel="vs last month"
            />
            <MetricCard
              label="Investments"
              value={data?.investmentTotal?.toLocaleString() || "0"}
              prefix="$"
              trend={0}
              trendLabel="vs last month"
            />
            <MetricCard
              label="Loans Outstanding"
              value={data?.loanTotal?.toLocaleString() || "0"}
              prefix="$"
              trend={0}
              trendLabel="vs last month"
            />
          </div>
        </>
      )}

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
