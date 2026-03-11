"use client"

import { useState, useEffect, useMemo } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Line,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricCard } from "@/components/dashboard/metric-card"
import { SectionHeader } from "@/components/dashboard/section-header"
import { useActiveProfile } from "@/hooks/use-active-profile"

export default function CashflowPage() {
  const { activeProfileId } = useActiveProfile()
  const [cashflowData, setCashflowData] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchCashflow() {
      if (!activeProfileId) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const url = new URL("/api/cashflow", window.location.origin)
        url.searchParams.set("profileId", activeProfileId)
        
        const now = new Date()
        const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        
        now.setMonth(now.getMonth() - 11)
        const startMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        
        url.searchParams.set("startMonth", startMonth)
        url.searchParams.set("endMonth", endMonth)

        const res = await fetch(url)
        if (res.ok) {
          const json = await res.json()
          setCashflowData(json || [])
        }
      } catch (error) {
        console.error("Failed to fetch cashflow data:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchCashflow()
  }, [activeProfileId])

  const chartData = useMemo(() => {
    // Basic grouping by month for the chart
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const grouped = new Map<string, any>()
    
    cashflowData.forEach(entry => {
      // month is format YYYY-MM-DD
      const date = new Date(entry.month)
      const monthLabel = monthNames[date.getMonth()]
      
      const current = grouped.get(monthLabel) || {
        month: monthLabel, inflow: 0, discretionary: 0, 
        insurance: 0, ilp: 0, loans: 0, tax: 0 
      }
      
      current.inflow += (entry.inflow || 0)
      
      // We don't have source breakdown in the generic monthly_cashflow table yet,
      // so we dump outflow into discretionary for now to make the chart work.
      current.discretionary += (entry.outflow || 0)
      
      grouped.set(monthLabel, current)
    })
    
    return Array.from(grouped.values())
  }, [cashflowData])

  const currentMonthMetrics = useMemo(() => {
    if (cashflowData.length === 0) return { inflow: 0, outflow: 0 }
    
    // Sort descending by month
    const sorted = [...cashflowData].sort((a, b) => new Date(b.month).getTime() - new Date(a.month).getTime())
    const latestMonth = sorted[0].month
    
    const currentEntries = sorted.filter(e => e.month === latestMonth)
    return currentEntries.reduce((acc, curr) => ({
      inflow: acc.inflow + (curr.inflow || 0),
      outflow: acc.outflow + (curr.outflow || 0)
    }), { inflow: 0, outflow: 0 })
    
  }, [cashflowData])

  const netSavings = currentMonthMetrics.inflow - currentMonthMetrics.outflow

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Cashflow"
        description="Monthly inflow vs outflow breakdown."
      />

      {isLoading ? (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
          Loading cashflow...
        </div>
      ) : cashflowData.length === 0 ? (
         <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
          No cashflow data found for this profile.
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>12-Month Cashflow</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
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
                      String(name).charAt(0).toUpperCase() + String(name).slice(1),
                    ]}
                    contentStyle={{
                      backgroundColor: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="discretionary"
                    name="Discretionary"
                    stackId="outflow"
                    fill="var(--color-chart-1)"
                  />
                  <Bar
                    dataKey="insurance"
                    name="Insurance"
                    stackId="outflow"
                    fill="var(--color-chart-2)"
                  />
                  <Bar
                    dataKey="ilp"
                    name="ILP"
                    stackId="outflow"
                    fill="var(--color-chart-3)"
                  />
                  <Bar
                    dataKey="loans"
                    name="Loans"
                    stackId="outflow"
                    fill="var(--color-chart-4)"
                  />
                  <Bar
                    dataKey="tax"
                    name="Tax"
                    stackId="outflow"
                    fill="var(--color-chart-5)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    type="monotone"
                    dataKey="inflow"
                    name="Inflow"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    dot={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard label="Inflow" value={currentMonthMetrics.inflow.toLocaleString()} prefix="$" />
            <MetricCard label="Outflow" value={currentMonthMetrics.outflow.toLocaleString()} prefix="$" />
            <MetricCard label="Net Savings" value={netSavings.toLocaleString()} prefix="$" />
          </div>

          <MetricCard
            label="Savings Rate"
            value={currentMonthMetrics.inflow > 0 ? Math.round((netSavings / currentMonthMetrics.inflow) * 100) : 0}
            suffix="%"
            tooltipId="SAVINGS_RATE"
          />
        </>
      )}
    </div>
  )
}
