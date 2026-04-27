"use client"

import { useMemo } from "react"
import { cn, formatCurrency } from "@/lib/utils"
import type { MonthPremiumEntry } from "@/lib/calculations/insurance-premium"
import { getUpcomingPremiums } from "@/lib/calculations/insurance-premium"

type PremiumCalendarProps = {
  readonly policies: Array<{
    name: string
    type: string
    premium_amount: number
    frequency: string
    yearly_outflow_date: number | null
    is_active: boolean
    cpf_premium?: number | null
  }>
}

export function PremiumCalendar({ policies }: PremiumCalendarProps) {
  const currentMonth = new Date().getMonth() + 1

  const months = useMemo(
    () => getUpcomingPremiums(policies, currentMonth),
    [policies, currentMonth],
  )

  const maxTotal = useMemo(
    () => Math.max(...months.map((m) => m.total), 1),
    [months],
  )

  if (policies.filter((p) => p.is_active).length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
        No active policies with premium data.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {months.map((entry) => (
        <MonthCard
          key={entry.month}
          entry={entry}
          isCurrent={entry.month === currentMonth}
          maxTotal={maxTotal}
        />
      ))}
    </div>
  )
}

function MonthCard({
  entry,
  isCurrent,
  maxTotal,
}: {
  readonly entry: MonthPremiumEntry
  readonly isCurrent: boolean
  readonly maxTotal: number
}) {
  const hasYearly = entry.premiums.some((p) => !p.isRecurring)
  const intensity = entry.total / maxTotal

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        isCurrent && "border-primary bg-primary/5 ring-1 ring-primary/20",
        !isCurrent && hasYearly && "border-yellow-500/30 bg-yellow-500/5",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-xs font-semibold uppercase tracking-wide",
            isCurrent ? "text-primary" : "text-muted-foreground",
          )}
        >
          {entry.monthLabel}
        </span>
        {isCurrent && (
          <span className="size-1.5 rounded-full bg-primary" />
        )}
      </div>

      <div className="mt-2 text-base font-semibold tabular-nums">
        ${formatCurrency(entry.total)}
      </div>

      {/* Intensity bar */}
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isCurrent ? "bg-primary" : hasYearly ? "bg-yellow-500" : "bg-muted-foreground/40",
          )}
          style={{ width: `${Math.max(intensity * 100, 2)}%` }}
        />
      </div>

      {/* Policy breakdown */}
      <div className="mt-2 space-y-0.5">
        {entry.premiums.map((p, i) => (
          <div
            key={`${p.name}-${i}`}
            className={cn(
              "flex items-center gap-1 text-[10px] leading-tight",
              p.isCpf ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground",
            )}
          >
            {p.isCpf ? (
              <span className="shrink-0 text-[8px]" title="CPF premium">
                ◆
              </span>
            ) : p.isRecurring ? (
              <span className="shrink-0 text-[8px]" title="Monthly recurring">
                ↻
              </span>
            ) : (
              <span className="shrink-0 text-[8px] text-yellow-600" title="Yearly premium">
                ★
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <span className="shrink-0 tabular-nums">
              ${formatCurrency(p.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
