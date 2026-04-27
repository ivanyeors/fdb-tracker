"use client"

import { useMemo } from "react"
import { AllocationChart } from "@/components/dashboard/investments/allocation-chart"
import {
  buildLookThroughAllocation,
  buildCrossIlpTopHoldings,
  hasIlpLookThroughData,
  type IlpProductForAllocation,
} from "@/lib/investments/allocation-views"
import type { Holding } from "@/lib/investments/holding"

interface PortfolioLookThroughProps {
  readonly holdings: readonly Holding[]
  readonly ilpProducts: readonly IlpProductForAllocation[]
  readonly cashBalance: number
}

export function PortfolioLookThrough({
  holdings,
  ilpProducts,
  cashBalance,
}: PortfolioLookThroughProps) {
  const hasData = useMemo(
    () => hasIlpLookThroughData(ilpProducts),
    [ilpProducts],
  )

  const effectiveMix = useMemo(
    () => buildLookThroughAllocation(holdings, ilpProducts, cashBalance),
    [holdings, ilpProducts, cashBalance],
  )

  const topHoldings = useMemo(
    () => buildCrossIlpTopHoldings(ilpProducts),
    [ilpProducts],
  )

  if (!hasData) return null

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground/70">
        Decomposes ILP fund wrappers to show your real asset exposure
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: effective asset mix donut */}
        <div className="rounded-xl border p-4">
          <AllocationChart
            data={effectiveMix}
            title="Effective Asset Mix"
            centerLabel="Portfolio"
          />
        </div>

        {/* Right: top holdings across all ILP */}
        {topHoldings && topHoldings.length > 0 && (
          <div className="rounded-xl border p-4">
            <h4 className="mb-3 text-center text-sm font-medium text-muted-foreground">
              Top Holdings Across All ILP
            </h4>
            <div className="space-y-1.5">
              {topHoldings.map((h) => (
                <div
                  key={h.rank}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/10 px-3 py-2 text-sm"
                >
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {h.rank}.
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {h.name}
                  </span>
                  {h.sector && (
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                      {h.sector}
                    </span>
                  )}
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {h.weightPct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
