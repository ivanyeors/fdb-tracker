"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
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
import { format } from "date-fns"

interface StockNote {
  id: string
  type: string
  journal_text: string
  created_at: string
}

export interface SellHoldingInitial {
  symbol: string
  maxUnits: number
  holdingType?: string
}

interface SellHoldingDialogProps {
  initial: SellHoldingInitial
  defaultPrice?: number | null
  onSuccess?: () => void
}

export function SellHoldingDialog({ initial, defaultPrice, onSuccess }: SellHoldingDialogProps) {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [open, setOpen] = useState(false)
  const [quantity, setQuantity] = useState("")
  const [price, setPrice] = useState<number | null>(null)
  const [commission, setCommission] = useState<number | null>(null)
  const [journalText, setJournalText] = useState("")
  const showCommission = !initial.holdingType || !["gold", "silver"].includes(initial.holdingType)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notes, setNotes] = useState<StockNote[]>([])

  useEffect(() => {
    if (!open) return
    setQuantity("")
    setPrice(defaultPrice ?? null)
    setCommission(null)
    setJournalText("")
  }, [open, initial.symbol, initial.maxUnits, defaultPrice])

  useEffect(() => {
    if (!open) {
      setNotes([])
      return
    }
    const params = new URLSearchParams({ symbol: initial.symbol })
    if (activeProfileId) params.set("profileId", activeProfileId)
    if (activeFamilyId && !activeProfileId)
      params.set("familyId", activeFamilyId)

    fetch(`/api/investments/transactions/notes?${params}`)
      .then((r) => (r.ok ? r.json() : { notes: [] }))
      .then((d) => setNotes(d.notes ?? []))
      .catch(() => setNotes([]))
  }, [open, initial.symbol, activeProfileId, activeFamilyId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProfileId && !activeFamilyId) {
      toast.error("Please select a profile or family first.")
      return
    }
    const qty = Number.parseFloat(quantity)
    if (Number.isNaN(qty) || qty <= 0) {
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
          ...((commission ?? 0) > 0 && { commission }),
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
        {notes.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-sm font-medium">
              Your notes for {initial.symbol}
            </p>
            <ScrollArea className="max-h-40 rounded-md border">
              <div className="space-y-3 p-3">
                {notes.map((note) => (
                  <div key={note.id} className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">
                        {format(new Date(note.created_at), "d MMM yyyy")}
                      </span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {note.type.charAt(0).toUpperCase() + note.type.slice(1)}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-sm leading-snug">
                      {note.journal_text}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sell-qty">Quantity</Label>
            <Input
              id="sell-qty"
              type="number"
              inputMode="decimal"
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
          {showCommission && (
            <div className="space-y-1.5">
              <Label htmlFor="sell-commission">Commission (optional)</Label>
              <CurrencyInput
                id="sell-commission"
                placeholder="0.00"
                value={commission}
                onChange={(v) => setCommission(v)}
              />
              {(commission ?? 0) > 0 && price != null && quantity && (
                <p className="text-muted-foreground text-xs">
                  Net proceeds: $
                  {(Number.parseFloat(quantity) * price - (commission ?? 0)).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              )}
            </div>
          )}
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
