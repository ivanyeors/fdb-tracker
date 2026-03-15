"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SymbolPickerDrawer } from "@/components/dashboard/investments/symbol-picker-drawer"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { Loader2, Plus, X } from "lucide-react"
import { toast } from "sonner"

interface JournalFormProps {
  onSuccess?: () => void
}

export function JournalForm({ onSuccess }: JournalFormProps) {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [type, setType] = useState<"buy" | "sell">("buy")
  const [symbol, setSymbol] = useState("")
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [quantity, setQuantity] = useState("")
  const [price, setPrice] = useState<number | null>(null)
  const [journalText, setJournalText] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProfileId && !activeFamilyId) {
      toast.error("Please select a profile or family first.")
      return
    }

    const qty = parseFloat(quantity)
    if (isNaN(qty) || qty <= 0) {
      toast.error("Please enter a valid quantity.")
      return
    }

    const priceVal = price ?? 0
    if (priceVal < 0) {
      toast.error("Please enter a valid price.")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/investments/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.trim(),
          type,
          quantity: qty,
          price: priceVal,
          journalText: journalText.trim() || undefined,
          ...(activeProfileId && { profileId: activeProfileId }),
          ...(activeFamilyId && !activeProfileId && { familyId: activeFamilyId }),
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Failed to add transaction")
      }

      toast.success(`${type === "buy" ? "Buy" : "Sell"} entry added successfully`)
      setSymbol("")
      setQuantity("")
      setPrice(null)
      setJournalText("")
      onSuccess?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Tabs
        value={type}
        onValueChange={(v) => setType(v as "buy" | "sell")}
      >
        <TabsList>
          <TabsTrigger value="buy">Buy</TabsTrigger>
          <TabsTrigger value="sell">Sell</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="journal-symbol">Symbol</Label>
          {symbol ? (
            <div className="flex items-center gap-2">
              <span
                id="journal-symbol"
                className="inline-flex items-center gap-1 rounded-md border bg-muted px-3 py-2 text-sm font-medium"
              >
                {symbol}
                <button
                  type="button"
                  onClick={() => setSymbol("")}
                  className="rounded p-0.5 hover:bg-muted-foreground/20"
                  aria-label="Clear symbol"
                >
                  <X className="size-3.5" />
                </button>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDrawerOpen(true)}
              >
                Change
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              id="journal-symbol"
              className="w-full justify-start text-muted-foreground"
              onClick={() => setDrawerOpen(true)}
            >
              <Plus className="mr-2 size-4" />
              Add symbol
            </Button>
          )}
          <SymbolPickerDrawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            onSelect={(s) => {
              setSymbol(s)
              setDrawerOpen(false)
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="journal-qty">Quantity</Label>
          <Input
            id="journal-qty"
            type="number"
            step="any"
            placeholder="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="journal-price">Price ($)</Label>
          <CurrencyInput
            id="journal-price"
            placeholder="0.00"
            value={price}
            onChange={(v) => setPrice(v)}
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="journal-text">Journal (optional)</Label>
        <Textarea
          id="journal-text"
          placeholder="Trading notes, thesis, or observations…"
          value={journalText}
          onChange={(e) => setJournalText(e.target.value)}
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="journal-image">Screenshot (optional)</Label>
        <Input id="journal-image" type="file" accept="image/*" />
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
  )
}
