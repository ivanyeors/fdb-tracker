"use client"

import { cn, formatCurrency } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getNextGiroPaymentIndex } from "@/lib/calculations/tax-giro"

export interface GiroInstalment {
  month: string
  amount: number
}

interface GiroTimelineProps {
  readonly schedule: GiroInstalment[]
  readonly totalPayable: number
  readonly outstandingBalance?: number
  readonly source?: "calculated" | "manual" | "pdf_import"
  readonly className?: string
}

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-")
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleDateString("en-SG", { month: "short", year: "numeric" })
}

export function GiroTimeline({
  schedule,
  totalPayable,
  outstandingBalance,
  source,
  className,
}: GiroTimelineProps) {
  if (schedule.length === 0) return null

  const nextIndex = getNextGiroPaymentIndex(schedule)
  const paidCount = nextIndex === -1 ? schedule.length : nextIndex
  const remaining =
    nextIndex >= 0
      ? schedule.slice(nextIndex).reduce((s, g) => s + g.amount, 0)
      : 0

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">GIRO Payment Schedule</CardTitle>
            <CardDescription className="text-xs">
              {(() => {
                if (source === "pdf_import") return "Imported from IRAS GIRO plan"
                if (source === "manual") return "Manually entered"
                return "Auto-calculated from tax assessment"
              })()}
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium tabular-nums">
              ${formatCurrency(totalPayable)}
            </p>
            <p className="text-xs text-muted-foreground">total</p>
          </div>
        </div>
        {outstandingBalance != null && outstandingBalance > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Includes ${formatCurrency(outstandingBalance)} outstanding from prior
            period
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-x-3 gap-y-1 sm:grid-cols-4">
          {schedule.map((g, i) => {
            const isPast = i < paidCount
            const isNext = i === nextIndex
            return (
              <div
                key={g.month}
                className={cn(
                  "flex items-center justify-between rounded-md px-2 py-1.5 text-sm",
                  isNext && "bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-950/30 dark:ring-blue-800",
                  isPast && "text-muted-foreground line-through decoration-muted-foreground/40"
                )}
              >
                <span className="text-xs">{formatMonth(g.month)}</span>
                <span className="tabular-nums font-medium">
                  ${formatCurrency(g.amount)}
                </span>
              </div>
            )
          })}
        </div>

        {nextIndex >= 0 && (
          <div className="mt-3 flex items-center justify-between border-t pt-2">
            <div className="text-sm">
              <Badge variant="outline" className="mr-2 text-xs">
                Next: {formatMonth(schedule[nextIndex].month)}
              </Badge>
              <span className="text-muted-foreground">
                ${formatCurrency(schedule[nextIndex].amount)} on 6th
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              ${formatCurrency(remaining)} remaining ({schedule.length - paidCount}{" "}
              payments)
            </p>
          </div>
        )}

        {nextIndex === -1 && (
          <p className="mt-3 border-t pt-2 text-center text-sm text-green-600 dark:text-green-400">
            All payments completed
          </p>
        )}
      </CardContent>
    </Card>
  )
}
