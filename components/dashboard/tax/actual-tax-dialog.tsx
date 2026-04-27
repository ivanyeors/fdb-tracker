"use client"

import { useState, useEffect } from "react"
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "@/components/ui/responsive-dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

interface ActualTaxDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly profileId: string
  readonly year: number
  readonly initialAmount?: number | null
  readonly onSuccess: () => void
}

export function ActualTaxDialog({
  open,
  onOpenChange,
  profileId,
  year,
  initialAmount,
  onSuccess,
}: ActualTaxDialogProps) {
  const [amount, setAmount] = useState<number>(initialAmount ?? 0)

  useEffect(() => {
    if (open) setAmount(initialAmount ?? 0)
  }, [open, initialAmount])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch("/api/tax/actual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: profileId,
          year,
          actual_amount: amount,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Failed to save")
      toast.success("Actual tax amount saved")
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Enter Actual Tax (IRAS)</DialogTitle>
            <DialogDescription>
              Enter the actual tax amount from your IRAS assessment for YA {year} to compare with the calculated amount.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="actual-amount">Actual amount ($)</Label>
              <CurrencyInput
                id="actual-amount"
                value={amount}
                onChange={(v) => setAmount(v ?? 0)}
                placeholder="0.00"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
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
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
