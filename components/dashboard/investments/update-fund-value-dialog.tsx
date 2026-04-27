"use client"

import { useEffect, useState } from "react"
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Label } from "@/components/ui/label"
import { MonthYearPicker } from "@/components/ui/month-year-picker"
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "@/components/ui/responsive-dialog"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { useInvestmentsDisplayCurrency } from "@/components/dashboard/investments/investments-display-currency"
import { formatIlpChartMonthLabel } from "@/lib/investments/ilp-chart"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

function currentMonthIso(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`
}

function normalizeStatementMonth(month: string | null | undefined): string {
  if (!month?.trim()) return currentMonthIso()
  const head = month.trim().length >= 10 ? month.trim().slice(0, 10) : month.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return `${head.slice(0, 7)}-01`
  if (/^\d{4}-\d{2}$/.test(head)) return `${head}-01`
  return currentMonthIso()
}

interface UpdateFundValueDialogProps {
  readonly productId: string
  readonly productName: string
  /** Latest snapshot we've seen — used to pre-fill and to render variance vs entered value. */
  readonly latestEntryMonth: string | null
  readonly latestEntryFundValue: number
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onSuccess?: () => void
}

export function UpdateFundValueDialog({
  productId,
  productName,
  latestEntryMonth,
  latestEntryFundValue,
  open,
  onOpenChange,
  onSuccess,
}: UpdateFundValueDialogProps) {
  const { activeFamilyId } = useActiveProfile()
  const { formatMoney } = useInvestmentsDisplayCurrency()

  const [month, setMonth] = useState<string>(currentMonthIso())
  const [fundValue, setFundValue] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    const defaultMonth = currentMonthIso()
    setMonth(defaultMonth)
    const latestNormalized = normalizeStatementMonth(latestEntryMonth)
    setFundValue(latestNormalized === defaultMonth ? latestEntryFundValue : null)
  }, [open, latestEntryMonth, latestEntryFundValue])

  const enteredValue = fundValue ?? 0
  const showVariance =
    fundValue != null && latestEntryFundValue > 0 && enteredValue !== latestEntryFundValue
  const delta = enteredValue - latestEntryFundValue
  const deltaPct = latestEntryFundValue > 0 ? (delta / latestEntryFundValue) * 100 : 0
  const isPositive = delta >= 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeFamilyId) {
      toast.error("Please select a family first.")
      return
    }
    if (!month || !/^\d{4}-\d{2}-\d{2}$/.test(month)) {
      toast.error("Please choose a valid month.")
      return
    }
    if (fundValue == null || fundValue < 0) {
      toast.error("Please enter a valid fund value.")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/investments/ilp/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          familyId: activeFamilyId,
          month,
          fundValue,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Failed to update fund value")
      }

      toast.success("Fund value updated")
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsSubmitting(false)
    }
  }

  const priorLabel = latestEntryMonth
    ? formatIlpChartMonthLabel(latestEntryMonth.slice(0, 7))
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update fund value — {productName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {latestEntryFundValue > 0 && priorLabel ? (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Latest on file: </span>
              <span className="font-medium tabular-nums">
                {formatMoney(latestEntryFundValue)}
              </span>
              <span className="text-muted-foreground"> ({priorLabel})</span>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="update-fv-month">Statement month</Label>
            <MonthYearPicker
              id="update-fv-month"
              value={month}
              onChange={(d) => setMonth(d ?? currentMonthIso())}
              placeholder="Statement month"
              className="w-full max-w-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="update-fv-value">Fund value ($)</Label>
            <CurrencyInput
              id="update-fv-value"
              placeholder="0.00"
              value={fundValue}
              onChange={(v) => setFundValue(v)}
              required
            />
            {showVariance ? (
              <div
                className={cn(
                  "flex items-center gap-1 pt-1 text-xs font-medium",
                  isPositive ? "text-emerald-500" : "text-red-500",
                )}
              >
                {isPositive ? (
                  <ArrowUp className="size-3" />
                ) : (
                  <ArrowDown className="size-3" />
                )}
                <span className="tabular-nums">
                  {isPositive ? "+" : ""}
                  {formatMoney(delta)}
                </span>
                {Number.isFinite(deltaPct) ? (
                  <span className="tabular-nums opacity-90">
                    ({isPositive ? "+" : ""}
                    {deltaPct.toFixed(2)}%)
                  </span>
                ) : null}
                <span className="text-muted-foreground font-normal">
                  vs latest
                </span>
              </div>
            ) : null}
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
