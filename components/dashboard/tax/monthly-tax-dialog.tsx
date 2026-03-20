"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { CurrencyInput } from "@/components/ui/currency-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { formatCurrency } from "@/lib/utils"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

interface MonthlyTaxDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profileId: string
  year: number
  onSuccess: () => void
}

export function MonthlyTaxDialog({
  open,
  onOpenChange,
  profileId,
  year,
  onSuccess,
}: MonthlyTaxDialogProps) {
  const [monthlyAmount, setMonthlyAmount] = useState(0)
  const [paymentsPerYear, setPaymentsPerYear] = useState("12")
  const [syncBonus, setSyncBonus] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setMonthlyAmount(0)
      setPaymentsPerYear("12")
      setSyncBonus(true)
      setError(null)
    }
  }, [open, profileId, year])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      const n = Number.parseInt(paymentsPerYear, 10)
      const res = await fetch("/api/tax/from-monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: profileId,
          year,
          monthly_amount: monthlyAmount,
          payments_per_year: Number.isFinite(n) ? n : 12,
          sync_bonus_estimate: syncBonus,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Failed to save")
      toast.success("Monthly tax instalment applied")
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong"
      setError(msg)
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  const payments = Number.parseInt(paymentsPerYear, 10)
  const impliedAnnual =
    Number.isFinite(payments) && payments > 0
      ? Math.round(monthlyAmount * payments * 100) / 100
      : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Tax from monthly instalment</DialogTitle>
            <DialogDescription>
              Implied annual YA {year} tax = monthly amount × number of equal payments (e.g. GIRO
              often uses 12). IRAS may use a different schedule, lump sums, or interest—use{" "}
              <strong>Enter IRAS actual</strong> if you have the exact assessment total.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="monthly-tax-amount">Monthly instalment ($)</Label>
              <CurrencyInput
                id="monthly-tax-amount"
                value={monthlyAmount}
                onChange={(v) => setMonthlyAmount(v ?? 0)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payments-per-year">Number of payments</Label>
              <Select value={paymentsPerYear} onValueChange={setPaymentsPerYear}>
                <SelectTrigger id="payments-per-year" className="w-full">
                  <SelectValue placeholder="12" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((k) => (
                    <SelectItem key={k} value={String(k)}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {impliedAnnual != null && monthlyAmount > 0
                  ? `Implied annual tax: $${formatCurrency(impliedAnnual)}`
                  : "Choose how many instalments sum to your full YA tax."}
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 px-3 py-2">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="sync-bonus" className="text-sm font-medium">
                  Update bonus estimate to match
                </Label>
                <p className="text-xs text-muted-foreground leading-snug">
                  Adjusts <strong>Settings → Users → Bonus estimate</strong> so this app&apos;s tax
                  model aligns with the implied annual amount (salary and reliefs stay as-is).
                </p>
              </div>
              <Switch
                id="sync-bonus"
                checked={syncBonus}
                onCheckedChange={setSyncBonus}
                className="shrink-0"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || monthlyAmount <= 0}>
              {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Apply
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
