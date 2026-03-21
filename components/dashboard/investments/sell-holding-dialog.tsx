"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { Loader2, TrendingDown } from "lucide-react"
import { toast } from "sonner"

export interface SellHoldingInitial {
  symbol: string
  maxUnits: number
}

interface SellHoldingDialogProps {
  initial: SellHoldingInitial
  onSuccess?: () => void
}

export function SellHoldingDialog({ initial, onSuccess }: SellHoldingDialogProps) {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [open, setOpen] = useState(false)
  const [quantity, setQuantity] = useState("")
  const [price, setPrice] = useState<number | null>(null)
  const [journalText, setJournalText] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setQuantity("")
    setPrice(null)
    setJournalText("")
  }, [open, initial.symbol, initial.maxUnits])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProfileId && !activeFamilyId) {
      toast.error("Please select a profile or family first.")
      return
    }
    const qty = parseFloat(quantity)
    if (isNaN(qty) || qty <= 0) {
      toast.error("Enter a valid quantity.")
      return
    }
    if (qty > initial.maxUnits + 1e-9) {
      toast.error(`You only have ${initial.maxUnits} units.`)
      return
    }
    const p = price ?? 0
    if (p < 0) {
      toast.error("Enter a valid price per unit.")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/investments/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: initial.symbol,
          type: "sell",
          quantity: qty,
          price: p,
          ...(journalText.trim() && { journalText: journalText.trim() }),
          ...(activeProfileId && { profileId: activeProfileId }),
          ...(activeFamilyId && !activeProfileId && { familyId: activeFamilyId }),
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Sell failed")
      }

      toast.success("Sale recorded")
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          aria-label={`Sell ${initial.symbol}`}
        >
          <TrendingDown className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sell {initial.symbol}</DialogTitle>
          <DialogDescription>
            Record a sale (updates your holding, cash balance, and journal). Max{" "}
            {initial.maxUnits} units.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sell-qty">Quantity</Label>
            <Input
              id="sell-qty"
              type="number"
              step="any"
              min="0"
              max={initial.maxUnits}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sell-price">Price per unit ($)</Label>
            <CurrencyInput
              id="sell-price"
              placeholder="0.00"
              value={price}
              onChange={(v) => setPrice(v)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sell-note">Note (optional)</Label>
            <Textarea
              id="sell-note"
              placeholder="Why you sold, context for later…"
              value={journalText}
              onChange={(e) => setJournalText(e.target.value)}
              rows={3}
              maxLength={2000}
              className="resize-none"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Recording…
                </>
              ) : (
                "Record sale"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
