"use client"

import { useMemo } from "react"
import { AlertTriangle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useInvestmentsDisplayCurrency } from "@/components/dashboard/investments/investments-display-currency"
import {
  concentrationMetrics,
  type IlpProductForAllocation,
} from "@/lib/investments/allocation-views"
import type { Holding } from "@/lib/investments/holding"

interface AllocationInsightsProps {
  holdings: readonly Holding[]
  ilpProducts: readonly IlpProductForAllocation[]
  cashBalance: number
  ilpTotalSum: number
  fullPortfolioTotal: number
  loading?: boolean
}

function InsightCard({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardContent className="px-4 py-3">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <div className="mt-0.5">{children}</div>
      </CardContent>
    </Card>
  )
}

function InsightSkeleton() {
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <Skeleton className="mb-2 h-3 w-16" />
        <Skeleton className="h-6 w-20" />
      </CardContent>
    </Card>
  )
}

export function AllocationInsights({
  holdings,
  ilpProducts,
  cashBalance,
  ilpTotalSum,
  fullPortfolioTotal,
  loading,
}: AllocationInsightsProps) {
  const { formatMoney } = useInvestmentsDisplayCurrency()

  const metrics = useMemo(
    () =>
      concentrationMetrics(
        holdings,
        ilpProducts,
        cashBalance,
        ilpTotalSum,
        fullPortfolioTotal,
      ),
    [holdings, ilpProducts, cashBalance, ilpTotalSum, fullPortfolioTotal],
  )

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <InsightSkeleton key={i} />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <InsightCard label="Positions">
        <p className="text-lg font-bold tabular-nums">{metrics.positionCount}</p>
      </InsightCard>

      <InsightCard label="Largest Position">
        <p className="flex items-center gap-1.5 text-lg font-bold tabular-nums">
          {metrics.largestPct >= 20 && (
            <AlertTriangle className="size-4 shrink-0 text-amber-500" />
          )}
          {metrics.largestPct.toFixed(1)}%
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {metrics.largestName}
        </p>
      </InsightCard>

      <InsightCard label="Top 5 Concentration">
        <p
          className={cn(
            "text-lg font-bold tabular-nums",
            metrics.top5Pct >= 70 && "text-amber-500",
          )}
        >
          {metrics.top5Pct.toFixed(1)}%
        </p>
      </InsightCard>

      <InsightCard label="Currency Split">
        <div className="flex items-baseline gap-2 text-lg font-bold tabular-nums">
          <span>
            SGD {metrics.sgdPct.toFixed(0)}%
          </span>
          <span className="text-muted-foreground">/</span>
          <span>
            USD {metrics.usdPct.toFixed(0)}%
          </span>
        </div>
      </InsightCard>

      <InsightCard label="ILP Weight">
        <p className="text-lg font-bold tabular-nums">
          {metrics.ilpPct.toFixed(1)}%
        </p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {formatMoney(ilpTotalSum)}
        </p>
      </InsightCard>
    </div>
  )
}
