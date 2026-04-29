"use client"

import { TrendingDown, TrendingUp } from "lucide-react"
import { useInvestmentsDisplayCurrency } from "@/components/dashboard/investments/investments-display-currency"
import { cn } from "@/lib/utils"

interface PortfolioSummaryProps {
  readonly totalInvested: number
  readonly currentValue: number
  readonly cashBalance: number
}

export function PortfolioSummary({
  totalInvested,
  currentValue,
  cashBalance,
}: PortfolioSummaryProps) {
  const { formatMoney } = useInvestmentsDisplayCurrency()
  const unrealizedPnL = currentValue - totalInvested
  const unrealizedPnLPct =
    totalInvested === 0 ? 0 : (unrealizedPnL / totalInvested) * 100
  const isPositive = unrealizedPnL >= 0

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatBox label="Total Invested" value={formatMoney(totalInvested)} />
      <StatBox label="Current Value" value={formatMoney(currentValue)} />
      <StatBox
        label="Unrealized P&L"
        value={
          <span
            className={cn(
              "flex items-center gap-1",
              isPositive
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400",
            )}
          >
            {isPositive ? (
              <TrendingUp className="size-3.5" />
            ) : (
              <TrendingDown className="size-3.5" />
            )}
            {formatMoney(Math.abs(unrealizedPnL))}
            <span className="text-xs">
              ({isPositive ? "+" : "-"}
              {Math.abs(unrealizedPnLPct).toFixed(1)}%)
            </span>
          </span>
        }
      />
      <StatBox label="Brokerage Cash" value={formatMoney(cashBalance)} />
    </div>
  )
}

function StatBox({
  label,
  value,
}: {
  readonly label: string
  readonly value: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  )
}
