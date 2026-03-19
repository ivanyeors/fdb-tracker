"use client"

import { formatCurrency } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Pencil } from "lucide-react"

interface TaxComparisonProps {
  year: number
  calculatedAmount: number
  actualAmount: number | null
  onEnterActual: () => void
  profileName?: string
}

export function TaxComparison({
  year,
  calculatedAmount,
  actualAmount,
  onEnterActual,
  profileName,
}: TaxComparisonProps) {
  const diff =
    actualAmount != null ? actualAmount - calculatedAmount : null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">
          {profileName ? `${profileName} — ` : ""}YA {year} — Calculated vs Actual
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onEnterActual}>
          <Pencil className="mr-1 size-4" />
          {actualAmount != null ? "Edit" : "Enter"} actual
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Calculated</p>
            <p className="text-lg font-semibold tabular-nums">
              ${formatCurrency(calculatedAmount)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Actual (IRAS)</p>
            <p className="text-lg font-semibold tabular-nums">
              {actualAmount != null
                ? `$${formatCurrency(actualAmount)}`
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Difference</p>
            <p
              className={`text-lg font-semibold tabular-nums ${
                diff != null && diff < 0
                  ? "text-green-600 dark:text-green-400"
                  : diff != null && diff > 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-muted-foreground"
              }`}
            >
              {diff != null
                ? `${diff >= 0 ? "+" : ""}$${formatCurrency(diff)}`
                : "—"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
