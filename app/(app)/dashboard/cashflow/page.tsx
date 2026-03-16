"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CashflowChart } from "@/components/dashboard/cashflow/cashflow-chart"
import { MetricCard } from "@/components/dashboard/metric-card"
import { SectionHeader } from "@/components/dashboard/section-header"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { ChartSkeleton } from "@/components/loading"

export default function CashflowPage() {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [cashflowData, setCashflowData] = useState<
    Array<{
      month: string
      inflow: number
      discretionary: number
      insurance: number
      ilp: number
      loans: number
      tax: number
      totalOutflow: number
    }>
  >([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchCashflow() {
      if (!activeProfileId && !activeFamilyId) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const url = new URL("/api/cashflow", window.location.origin)
        if (activeProfileId) url.searchParams.set("profileId", activeProfileId)
        else if (activeFamilyId) url.searchParams.set("familyId", activeFamilyId)
        
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
  }, [activeProfileId, activeFamilyId])

  const chartData = useMemo(() => {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return cashflowData.map((entry) => {
      const date = new Date(entry.month)
      const year = date.getFullYear()
      const monthLabel = `${monthNames[date.getMonth()]} ${year}`
      return {
        month: monthLabel,
        sortKey: entry.month,
        inflow: entry.inflow,
        discretionary: entry.discretionary,
        insurance: entry.insurance,
        ilp: entry.ilp,
        loans: entry.loans,
        tax: entry.tax,
      }
    }).sort((a, b) => (a.sortKey ?? "").localeCompare(b.sortKey ?? ""))
  }, [cashflowData])

  const currentMonthMetrics = useMemo(() => {
    if (cashflowData.length === 0) return { inflow: 0, outflow: 0 }
    const sorted = [...cashflowData].sort((a, b) => b.month.localeCompare(a.month))
    const latest = sorted[0]
    return {
      inflow: latest?.inflow ?? 0,
      outflow: latest?.totalOutflow ?? 0,
    }
  }, [cashflowData])

  const netSavings = currentMonthMetrics.inflow - currentMonthMetrics.outflow

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Cashflow"
        description="Monthly inflow vs outflow. Outflow is your total (inclusive of tax, insurance, ILP, loans); breakdown is estimated from known deductions."
      />

      {isLoading ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>12-Month Cashflow</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartSkeleton height={300} />
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard label="" value={0} loading />
            <MetricCard label="" value={0} loading />
            <MetricCard label="" value={0} loading />
          </div>
        </>
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
              <CashflowChart data={chartData} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard label="Inflow" value={currentMonthMetrics.inflow} prefix="$" />
            <MetricCard label="Outflow" value={currentMonthMetrics.outflow} prefix="$" />
            <MetricCard label="Net Savings" value={netSavings} prefix="$" />
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
