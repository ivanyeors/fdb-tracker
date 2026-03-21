"use client"

import { Gem, Circle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { cn } from "@/lib/utils"
import { useInvestmentsDisplayCurrency } from "@/components/dashboard/investments/investments-display-currency"

interface MetalHolding {
  type: "gold" | "silver"
  unitsOz: number
  buyPrice: number
  sellPrice: number
  currentValue: number
  costBasis: number
  pnl: number
  pnlPct: number
  lastUpdated: string
  dateAdded: string
}

interface PreciousMetalsProps {
  metals: MetalHolding[]
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function PreciousMetals({ metals }: PreciousMetalsProps) {
  const { formatMoney } = useInvestmentsDisplayCurrency()
  const lastUpdated = metals[0]?.lastUpdated ?? "—"

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Precious Metals</CardTitle>
          <InfoTooltip id="GOLD_SILVER_VALUE" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {metals.map((m) => {
          const Icon = m.type === "gold" ? Gem : Circle
          return (
            <div
              key={m.type}
              className="flex items-start gap-3 rounded-lg border p-3"
            >
              <Icon
                className={cn(
                  "mt-0.5 size-5 shrink-0",
                  m.type === "gold"
                    ? "text-yellow-500"
                    : "text-stone-400",
                )}
              />
              <div className="flex-1 space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold capitalize">{m.type}</span>
                  <span className="text-muted-foreground">
                    {fmt(m.unitsOz)} oz
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    OCBC Buy / Sell
                  </span>
                  <span>
                    {formatMoney(m.buyPrice)} / {formatMoney(m.sellPrice)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Value</span>
                  <span className="font-medium">{formatMoney(m.currentValue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date Added</span>
                  <span className="font-medium">{m.dateAdded}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">P&L</span>
                  <span
                    className={cn(
                      "font-medium",
                      m.pnl >= 0 ? "text-emerald-500" : "text-red-500",
                    )}
                  >
                    {m.pnl >= 0 ? "+" : "-"}
                    {formatMoney(Math.abs(m.pnl))} (
                    {m.pnlPct >= 0 ? "+" : ""}
                    {fmt(m.pnlPct)}%)
                  </span>
                </div>
              </div>
            </div>
          )
        })}
        <p className="text-xs text-muted-foreground">
          Last updated: {lastUpdated}
        </p>
      </CardContent>
    </Card>
  )
}
