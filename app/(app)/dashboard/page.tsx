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
  } | null>(null)
  const [trendData, setTrendData] = useState<{ month: string; value: number }[]>(
    [],
  )
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchOverview() {
      setIsLoading(true)
      try {
        const params = new URLSearchParams()
        if (activeProfileId) params.set("profileId", activeProfileId)
        if (activeFamilyId && !activeProfileId) params.set("familyId", activeFamilyId)
        const qs = params.toString()
        const [overviewRes, trendRes] = await Promise.all([
          fetch(`/api/overview${qs ? `?${qs}` : ""}`),
          fetch(`/api/overview/trend?months=12${qs ? `&${qs}` : ""}`),
        ])
        if (overviewRes.ok) {
          const json = await overviewRes.json()
          setData(json)
        }
        if (trendRes.ok) {
          const trend = await trendRes.json()
          setTrendData(
            Array.isArray(trend)
              ? trend.map((d: { month: string; value: number }) => ({
                  month: formatTrendMonth(d.month),
                  value: d.value,
                }))
              : [],
          )
        }
      } catch (error) {
        console.error("Failed to fetch overview:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchOverview()
  }, [activeProfileId, activeFamilyId])

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
            <MetricCard
              label="Loans Outstanding"
              value={data?.loanTotal ?? 0}
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
            <LineChart data={trendData.length > 0 ? trendData : [{ month: "-", value: 0 }]}>
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
