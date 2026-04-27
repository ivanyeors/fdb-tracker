"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Label } from "@/components/ui/label"
import { MonthYearPicker } from "@/components/ui/month-year-picker"
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogTrigger as DialogTrigger,
} from "@/components/ui/responsive-dialog"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

interface AddIlpEntryDialogProps {
  readonly productId: string
  readonly productName: string
  readonly onSuccess?: () => void
}

export function AddIlpEntryDialog({
  productId,
  productName,
  onSuccess,
}: AddIlpEntryDialogProps) {
  const { activeFamilyId } = useActiveProfile()
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState("")
  const [fundValue, setFundValue] = useState<number | null>(null)
  /** Cumulative premiums through the selected month (optional; improves return %). */
  const [premiumsPaid, setPremiumsPaid] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeFamilyId) {
      toast.error("Please select a family first.")
      return
    }

    const value = fundValue ?? 0
    if (value < 0) {
      toast.error("Please enter a valid fund value.")
      return
    }

    if (!month || !/^\d{4}-\d{2}-\d{2}$/.test(month)) {
      toast.error("Please choose a valid month.")
      return
    }

    const monthDate = month

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/investments/ilp/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          familyId: activeFamilyId,
          month: monthDate,
          fundValue: value,
          premiumsPaid,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Failed to add entry")
      }

      toast.success("Monthly value added successfully")
      setMonth("")
      setFundValue(null)
      setPremiumsPaid(null)
      setOpen(false)
      onSuccess?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-1 size-4" />
          Add monthly value
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add monthly value — {productName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ilp-entry-month">Month</Label>
            <MonthYearPicker
              id="ilp-entry-month"
              value={month || null}
              onChange={(d) => setMonth(d ?? "")}
              placeholder="Statement month"
              className="w-full max-w-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ilp-entry-value">Fund value ($)</Label>
            <CurrencyInput
              id="ilp-entry-value"
              placeholder="0.00"
              value={fundValue}
              onChange={(v) => setFundValue(v)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ilp-entry-premiums">Premiums paid to date ($)</Label>
            <CurrencyInput
              id="ilp-entry-premiums"
              placeholder="0.00"
              value={premiumsPaid}
              onChange={(v) => setPremiumsPaid(v)}
            />
            <p className="text-muted-foreground text-xs leading-snug">
              Total premiums through this month from your statement. Leave blank to
              estimate from monthly premium.
            </p>
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Adding...
              </>
            ) : (
              "Add Entry"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
