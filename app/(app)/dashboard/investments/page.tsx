"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { SectionHeader } from "@/components/dashboard/section-header"
import { MetricCard } from "@/components/dashboard/metric-card"
import { AllocationChart } from "@/components/dashboard/investments/allocation-chart"
import {
  HoldingsTable,
  type Holding,
} from "@/components/dashboard/investments/holdings-table"

const HOLDINGS: Holding[] = [
  {
    symbol: "DBS",
    type: "stock",
    units: 200,
    costBasis: 6800,
    currentPrice: 36,
    currentValue: 7200,
    pnl: 400,
    pnlPct: 5.88,
    portfolioPct: 7.78,
  },
  {
    symbol: "OCBC",
    type: "stock",
    units: 150,
    costBasis: 1875,
    currentPrice: 13.5,
    currentValue: 2025,
    pnl: 150,
    pnlPct: 8.0,
    portfolioPct: 2.19,
  },
  {
    symbol: "AAPL",
    type: "stock",
    units: 10,
    costBasis: 2150,
    currentPrice: 235,
    currentValue: 2350,
    pnl: 200,
    pnlPct: 9.3,
    portfolioPct: 2.54,
  },
  {
    symbol: "Gold",
    type: "gold",
    units: 1.5,
    costBasis: 6000,
    currentPrice: 4250,
    currentValue: 6375,
    pnl: 375,
    pnlPct: 6.25,
    portfolioPct: 6.89,
  },
  {
    symbol: "Silver",
    type: "silver",
    units: 50,
    costBasis: 2400,
    currentPrice: 49,
    currentValue: 2450,
    pnl: 50,
    pnlPct: 2.08,
    portfolioPct: 2.65,
  },
  {
    symbol: "Prudential ILP",
    type: "ilp",
    units: 1,
    costBasis: 12000,
    currentPrice: 13200,
    currentValue: 13200,
    pnl: 1200,
    pnlPct: 10.0,
    portfolioPct: 14.27,
  },
  {
    symbol: "AIA ILP",
    type: "ilp",
    units: 1,
    costBasis: 8000,
    currentPrice: 8500,
    currentValue: 8500,
    pnl: 500,
    pnlPct: 6.25,
    portfolioPct: 9.19,
  },
  {
    symbol: "STI ETF",
    type: "etf",
    units: 100,
    costBasis: 3200,
    currentPrice: 34,
    currentValue: 3400,
    pnl: 200,
    pnlPct: 6.25,
    portfolioPct: 3.68,
  },
]

const ALLOCATION_DATA = [
  { name: "Stocks", value: 50875, percentage: 55 },
  { name: "Gold", value: 18500, percentage: 20 },
  { name: "Silver", value: 4625, percentage: 5 },
  { name: "ILP", value: 18500, percentage: 20 },
]

export default function InvestmentsPage() {
  const top5 = [...HOLDINGS]
    .sort((a, b) => b.currentValue - a.currentValue)
    .slice(0, 5)

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Investments"
        description="Portfolio overview, allocation, and P&L."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Total Value"
          value="$92,500"
          tooltipId="INVESTMENT_PNL"
        />
        <MetricCard
          label="Total P&L"
          value="+$7,350"
          trend={8.6}
        />
        <MetricCard label="Allocation Count" value="8 holdings" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border p-4">
          <h3 className="mb-2 text-sm font-medium">Portfolio Allocation</h3>
          <AllocationChart data={ALLOCATION_DATA} />
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
    </div>
  )
}
