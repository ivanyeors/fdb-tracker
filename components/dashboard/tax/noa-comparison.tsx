"use client"

import { cn, formatCurrency } from "@/lib/utils"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ChevronDown } from "lucide-react"
import { useState } from "react"

export interface NoaData {
  employment_income: number | null
  chargeable_income: number | null
  total_deductions: number | null
  donations_deduction: number | null
  reliefs_total: number | null
  tax_payable: number | null
  payment_due_date: string | null
  reliefs_json: Array<{ type: string; label: string; amount: number }>
  bracket_summary_json: Array<{
    label: string
    income: number
    rate: number | null
    tax: number
  }>
  is_on_giro: boolean
}

interface NoaComparisonProps {
  noaData: NoaData
  estimate: {
    employmentIncome: number
    totalReliefs: number
    chargeableIncome: number
    taxPayable: number
    reliefBreakdown: Array<{
      type: string
      amount: number
      source: "auto" | "manual"
    }>
  }
  className?: string
}

function DeltaBadge({
  ours,
  iras,
}: {
  ours: number
  iras: number | null
}) {
  if (iras === null) return null
  const diff = ours - iras
  if (Math.abs(diff) < 0.01) {
    return (
      <Badge
        variant="outline"
        className="text-xs text-green-600 dark:text-green-400"
      >
        Match
      </Badge>
    )
  }
  const isOver = diff > 0
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs",
        isOver
          ? "text-amber-600 dark:text-amber-400"
          : "text-green-600 dark:text-green-400"
      )}
    >
      {isOver ? "+" : "-"}${formatCurrency(Math.abs(diff))}
    </Badge>
  )
}

function ComparisonRow({
  label,
  ours,
  iras,
  bold,
}: {
  label: string
  ours: number
  iras: number | null
  bold?: boolean
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr,auto,auto,auto] items-center gap-3 py-1.5",
        bold && "font-medium"
      )}
    >
      <span className="text-sm">{label}</span>
      <span className="text-right text-sm tabular-nums">
        ${formatCurrency(ours)}
      </span>
      <span className="text-right text-sm tabular-nums text-muted-foreground">
        {iras !== null ? `$${formatCurrency(iras)}` : "—"}
      </span>
      <DeltaBadge ours={ours} iras={iras} />
    </div>
  )
}

export function NoaComparison({
  noaData,
  estimate,
  className,
}: NoaComparisonProps) {
  const [reliefsOpen, setReliefsOpen] = useState(false)

  const dueDate = noaData.payment_due_date
    ? new Date(noaData.payment_due_date)
    : null
  const now = new Date()
  const daysUntilDue = dueDate
    ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">
              Estimate vs IRAS Assessment
            </CardTitle>
            <CardDescription className="text-xs">
              Line-by-line comparison from your imported NOA
            </CardDescription>
          </div>
          {dueDate && daysUntilDue !== null && (
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                daysUntilDue > 30
                  ? "text-green-600 dark:text-green-400"
                  : daysUntilDue > 0
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-red-600 dark:text-red-400"
              )}
            >
              {daysUntilDue > 0
                ? `Due in ${daysUntilDue}d`
                : daysUntilDue === 0
                  ? "Due today"
                  : `Overdue ${Math.abs(daysUntilDue)}d`}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {/* Header */}
        <div className="grid grid-cols-[1fr,auto,auto,auto] items-center gap-3 border-b pb-2 text-xs text-muted-foreground">
          <span />
          <span className="text-right">Estimate</span>
          <span className="text-right">IRAS</span>
          <span className="text-right">Delta</span>
        </div>

        <ComparisonRow
          label="Employment Income"
          ours={estimate.employmentIncome}
          iras={noaData.employment_income}
        />

        <Collapsible open={reliefsOpen} onOpenChange={setReliefsOpen}>
          <CollapsibleTrigger className="flex w-full items-center gap-1 py-1.5 text-sm hover:underline">
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                reliefsOpen && "rotate-180"
              )}
            />
            Total Reliefs
            <span className="ml-auto flex items-center gap-3 tabular-nums">
              <span>${formatCurrency(estimate.totalReliefs)}</span>
              <span className="text-muted-foreground">
                {noaData.reliefs_total !== null
                  ? `$${formatCurrency(noaData.reliefs_total)}`
                  : "—"}
              </span>
              <DeltaBadge
                ours={estimate.totalReliefs}
                iras={noaData.reliefs_total}
              />
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="ml-4 space-y-0.5 border-l pl-3">
              {(noaData.reliefs_json ?? []).map((r, i) => {
                const ourMatch = estimate.reliefBreakdown.find(
                  (b) =>
                    b.type === r.type ||
                    (r.type === "cpf_life_insurance" && b.type === "cpf")
                )
                return (
                  <ComparisonRow
                    key={i}
                    label={r.label}
                    ours={ourMatch?.amount ?? 0}
                    iras={r.amount}
                  />
                )
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {noaData.donations_deduction !== null && (
          <ComparisonRow
            label="Donations"
            ours={
              estimate.reliefBreakdown
                .filter((b) =>
                  ["donations", "donations_employer"].includes(b.type)
                )
                .reduce((s, b) => s + b.amount, 0)
            }
            iras={noaData.donations_deduction}
          />
        )}

        <div className="border-t pt-1">
          <ComparisonRow
            label="Chargeable Income"
            ours={estimate.chargeableIncome}
            iras={noaData.chargeable_income}
            bold
          />
        </div>

        <div className="border-t pt-1">
          <ComparisonRow
            label="Tax Payable"
            ours={estimate.taxPayable}
            iras={noaData.tax_payable}
            bold
          />
        </div>

        {/* IRAS bracket summary from NOA */}
        {(noaData.bracket_summary_json ?? []).length > 0 && (
          <div className="mt-2 rounded-md border bg-muted/30 p-3">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              IRAS Tax Computation
            </p>
            {noaData.bracket_summary_json.map((line, i) => (
              <div
                key={i}
                className="flex justify-between text-sm tabular-nums"
              >
                <span>{line.label}</span>
                <span>${formatCurrency(line.tax)}</span>
              </div>
            ))}
          </div>
        )}

        {noaData.is_on_giro && (
          <p className="mt-2 text-xs text-muted-foreground">
            Payment via GIRO
            {noaData.payment_due_date &&
              ` — due ${new Date(noaData.payment_due_date).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}`}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
