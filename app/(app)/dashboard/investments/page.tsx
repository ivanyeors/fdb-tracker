"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { SectionHeader } from "@/components/dashboard/section-header"
import { MetricCard } from "@/components/dashboard/metric-card"
import { AllocationChart } from "@/components/dashboard/investments/allocation-chart"
import {
  HoldingsTable,
  type Holding,
} from "@/components/dashboard/investments/holdings-table"
import { useActiveProfile } from "@/hooks/use-active-profile"

export default function InvestmentsPage() {
  const { activeProfileId } = useActiveProfile()
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchInvestments() {
      if (!activeProfileId) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const url = new URL("/api/investments", window.location.origin)
        url.searchParams.set("profileId", activeProfileId)

        const res = await fetch(url)
        if (res.ok) {
          const json = await res.json()
          
          let totalPortfolioValue = 0
          const mapped: Holding[] = json.map((inv: any) => {
            const val = inv.marketValue || (inv.units * inv.cost_basis)
            totalPortfolioValue += val
            return {
              symbol: inv.symbol,
              type: inv.type,
              units: inv.units,
              costBasis: inv.cost_basis * inv.units,
              currentPrice: inv.currentPrice || inv.cost_basis,
              currentValue: val,
              pnl: inv.unrealisedPnL || 0,
              pnlPct: inv.unrealisedPnLPct || 0,
              portfolioPct: 0, // calculated below
            }
          })

          const finalHoldings = mapped.map(h => ({
            ...h,
            portfolioPct: totalPortfolioValue > 0 ? (h.currentValue / totalPortfolioValue) * 100 : 0
          }))

          setHoldings(finalHoldings)
        }
      } catch (error) {
        console.error("Failed to fetch investments:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchInvestments()
  }, [activeProfileId])

  const totalValue = useMemo(() => holdings.reduce((sum, h) => sum + h.currentValue, 0), [holdings])
  const totalPnL = useMemo(() => holdings.reduce((sum, h) => sum + h.pnl, 0), [holdings])
  const totalCost = useMemo(() => holdings.reduce((sum, h) => sum + h.costBasis, 0), [holdings])
  
  const pnlPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0

  const allocationData = useMemo(() => {
    const grouped = new Map<string, number>()
    holdings.forEach(h => {
      // capitalizes first letter roughly or maps type
      const categoryLabel = h.type === "stock" ? "Stocks"
        : h.type === "etf" ? "ETF"
        : h.type === "gold" ? "Gold"
        : h.type === "silver" ? "Silver"
        : h.type === "ilp" ? "ILP"
        : h.type.charAt(0).toUpperCase() + h.type.slice(1)
        
      grouped.set(categoryLabel, (grouped.get(categoryLabel) || 0) + h.currentValue)
    })
    
    return Array.from(grouped.entries()).map(([name, value]) => ({
      name,
      value,
      percentage: totalValue > 0 ? (value / totalValue) * 100 : 0
    })).sort((a,b) => b.value - a.value)
  }, [holdings, totalValue])

  const top5 = [...holdings]
    .sort((a, b) => b.currentValue - a.currentValue)
    .slice(0, 5)

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Investments"
        description="Portfolio overview, allocation, and P&L."
      />

      {isLoading ? (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
          Loading investments...
        </div>
      ) : holdings.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
          No investment data found for this profile.
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label="Total Value"
              value={totalValue.toLocaleString()}
              prefix="$"
              tooltipId="INVESTMENT_PNL"
            />
            <MetricCard
              label="Total P&L"
              value={`${totalPnL >= 0 ? '+' : '-'}$${Math.abs(totalPnL).toLocaleString()}`}
              trend={pnlPct}
            />
            <MetricCard label="Allocation Count" value={`${holdings.length} holdings`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border p-4">
              <h3 className="mb-2 text-sm font-medium">Portfolio Allocation</h3>
              <AllocationChart data={allocationData} />
            </div>
            <div className="rounded-xl border p-4">
              <h3 className="mb-2 text-sm font-medium">Top Holdings by Value</h3>
              <HoldingsTable holdings={top5} />
            </div>
          </div>

          <Link
            href="/dashboard/investments/detail"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            View full portfolio
            <ArrowRight className="size-4" />
          </Link>
        </>
      )}
    </div>
  )
}
