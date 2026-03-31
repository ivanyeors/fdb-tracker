"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ButtonSelect } from "@/components/ui/button-select"
import { DatePicker } from "@/components/ui/date-picker"
import { SymbolPickerDrawer } from "@/components/dashboard/investments/symbol-picker-drawer"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { Loader2, Plus, X } from "lucide-react"
import { toast } from "sonner"

const HOLDING_TYPES = [
  { value: "stock", label: "Stock" },
  { value: "etf", label: "ETF" },
  { value: "gold", label: "Gold" },
  { value: "silver", label: "Silver" },
  { value: "bond", label: "Bond" },
] as const

interface AddHoldingFormProps {
  onSuccess?: () => void
}

export function AddHoldingForm({ onSuccess }: AddHoldingFormProps) {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [symbol, setSymbol] = useState("")
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [type, setType] = useState<"stock" | "etf" | "gold" | "silver" | "bond">(
    "stock",
  )
  const [units, setUnits] = useState("")
  const [costPerUnit, setCostPerUnit] = useState<number | null>(null)
  const [dateAdded, setDateAdded] = useState("")
  const [note, setNote] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const effectiveSymbol =
    type === "gold" ? "Gold" : type === "silver" ? "Silver" : symbol

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProfileId && !activeFamilyId) {
      toast.error("Please select a profile or family first.")
      return
    }

    const unitsNum = parseFloat(units)
    if (isNaN(unitsNum) || unitsNum <= 0) {
      toast.error("Please enter a valid quantity.")
      return
    }

    const cost = costPerUnit ?? 0
    if (cost < 0) {
      toast.error("Please enter a valid cost per unit.")
      return
    }

    if ((type === "stock" || type === "etf") && !symbol.trim()) {
      toast.error("Please search and select a symbol.")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: effectiveSymbol.trim(),
          type,
          units: unitsNum,
          costBasis: cost,
          ...(dateAdded && { dateAdded }),
          ...(note.trim() && { journalText: note.trim() }),
          ...(activeProfileId && { profileId: activeProfileId }),
          ...(activeFamilyId && !activeProfileId && { familyId: activeFamilyId }),
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Failed to add holding")
      }

      toast.success("Holding added successfully")
      setSymbol("")
      setUnits("")
      setCostPerUnit(null)
      setDateAdded("")
      setNote("")
      setType("stock")
      onSuccess?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="holding-type">Type</Label>
          <ButtonSelect
            value={type}
            onValueChange={(v) =>
              setType(v as "stock" | "etf" | "gold" | "silver" | "bond")
            }
            options={HOLDING_TYPES.map((t) => ({
              value: t.value,
              label: t.label,
            }))}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="holding-symbol">Symbol</Label>
          {type === "gold" || type === "silver" ? (
            <Input
              id="holding-symbol"
              value={effectiveSymbol}
              disabled
              className="bg-muted"
            />
          ) : symbol ? (
            <div className="flex items-center gap-2">
              <span
                id="holding-symbol"
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
              id="holding-symbol"
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
          <Label htmlFor="holding-units">Units</Label>
          <Input
            id="holding-units"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            placeholder="0"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="holding-cost">Cost per unit ($)</Label>
          <CurrencyInput
            id="holding-cost"
            placeholder="0.00"
            value={costPerUnit}
            onChange={(v) => setCostPerUnit(v)}
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="holding-date-added">Start date (optional)</Label>
        <DatePicker
          id="holding-date-added"
          value={dateAdded || null}
          onChange={(d) => setDateAdded(d ?? "")}
          placeholder="Select start date"
          className="w-full"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="holding-note">Note (optional)</Label>
        <Textarea
          id="holding-note"
          placeholder="Why you bought, thesis, reminders…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={2000}
          className="resize-none"
        />
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Adding...
          </>
        ) : (
          "Add Holding"
        )}
      </Button>
    </form>
  )
}
