"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { Loader2, Pencil } from "lucide-react"
import { toast } from "sonner"

function normalizeDateForInput(d: string): string {
  if (!d?.trim()) return new Date().toISOString().slice(0, 10)
  return d.length >= 10 ? d.slice(0, 10) : d
}

/** API month is YYYY-MM-DD; <input type="month"> wants YYYY-MM */
function monthToYm(month: string | null | undefined): string {
  if (!month?.trim()) return ""
  const s = month.length >= 10 ? month.slice(0, 10) : month
  return s.length >= 7 ? s.slice(0, 7) : ""
}

function currentMonthYm(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`
}

interface EditIlpDialogProps {
  productId: string
  productName: string
  monthlyPremium: number
  endDate: string
  /** Latest snapshot row from API (edit fund / premiums / month). */
  latestEntryMonth: string | null
  latestEntryFundValue: number
  latestEntryPremiumsPaid: number | null
  onSuccess?: () => void
}

export function EditIlpDialog({
  productId,
  productName,
  monthlyPremium,
  endDate,
  latestEntryMonth,
  latestEntryFundValue,
  latestEntryPremiumsPaid,
  onSuccess,
}: EditIlpDialogProps) {
  const { activeFamilyId } = useActiveProfile()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(productName)
  const [premium, setPremium] = useState<number | null>(monthlyPremium)
  const [end, setEnd] = useState(normalizeDateForInput(endDate))
  const [entryMonth, setEntryMonth] = useState("")
  const [fundValue, setFundValue] = useState<number | null>(0)
  const [premiumsPaid, setPremiumsPaid] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(productName)
    setPremium(monthlyPremium)
    setEnd(normalizeDateForInput(endDate))
    const ym = monthToYm(latestEntryMonth) || currentMonthYm()
    setEntryMonth(ym)
    setFundValue(latestEntryFundValue)
    setPremiumsPaid(
      latestEntryPremiumsPaid != null && Number(latestEntryPremiumsPaid) > 0
        ? Number(latestEntryPremiumsPaid)
        : null,
    )
  }, [
    open,
    productName,
    monthlyPremium,
    endDate,
    latestEntryMonth,
    latestEntryFundValue,
    latestEntryPremiumsPaid,
  ])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const premiumVal = premium ?? 0
    if (premiumVal <= 0) {
      toast.error("Please enter a valid monthly premium.")
      return
    }
    if (!end || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      toast.error("Please enter a valid end date (YYYY-MM-DD).")
      return
    }
    if (!entryMonth || !/^\d{4}-\d{2}$/.test(entryMonth)) {
      toast.error("Please choose a valid statement month (YYYY-MM).")
      return
    }
    if (!activeFamilyId) {
      toast.error("Please select a family first.")
      return
    }

    const fundVal = fundValue ?? 0
    if (fundVal < 0) {
      toast.error("Fund value cannot be negative.")
      return
    }

    setIsSubmitting(true)
    try {
      const patchRes = await fetch(`/api/investments/ilp/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          monthlyPremium: premiumVal,
          endDate: end,
          familyId: activeFamilyId,
        }),
      })

      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}))
        throw new Error(err.error ?? "Failed to update product")
      }

      const monthDate = `${entryMonth}-01`
      const entryRes = await fetch("/api/investments/ilp/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          familyId: activeFamilyId,
          month: monthDate,
          fundValue: fundVal,
          premiumsPaid,
        }),
      })

      if (!entryRes.ok) {
        const err = await entryRes.json().catch(() => ({}))
        throw new Error(err.error ?? "Failed to update monthly snapshot")
      }

      toast.success("ILP updated")
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
        <Button variant="ghost" size="sm">
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit ILP</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-ilp-name">Product name</Label>
            <Input
              id="edit-ilp-name"
              name="ilp-name"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-ilp-premium">Monthly premium ($)</Label>
              <CurrencyInput
                id="edit-ilp-premium"
                name="ilp-premium"
                value={premium}
                onChange={(v) => setPremium(v)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-ilp-end-date">Premium end date</Label>
              <Input
                id="edit-ilp-end-date"
                name="ilp-end-date"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="mb-3 text-muted-foreground text-xs">
              Monthly snapshot (statement month, fund value, cumulative premiums). Saving
              updates this row and card metrics.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="edit-ilp-entry-month">Statement month</Label>
                <Input
                  id="edit-ilp-entry-month"
                  name="ilp-entry-month"
                  type="month"
                  value={entryMonth}
                  onChange={(e) => setEntryMonth(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-ilp-fund">Fund value ($)</Label>
                <CurrencyInput
                  id="edit-ilp-fund"
                  name="ilp-fund"
                  placeholder="0.00"
                  value={fundValue}
                  onChange={(v) => setFundValue(v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-ilp-premiums-entry">Premiums paid to date ($)</Label>
                <CurrencyInput
                  id="edit-ilp-premiums-entry"
                  name="ilp-premiums-entry"
                  placeholder="0.00"
                  value={premiumsPaid}
                  onChange={(v) => setPremiumsPaid(v)}
                />
              </div>
            </div>
            <p className="mt-2 text-muted-foreground text-xs">
              Leave premiums blank to clear the statement figure (card will estimate from
              monthly premium).
            </p>
          </div>

          <Button type="submit" disabled={isSubmitting}>
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
