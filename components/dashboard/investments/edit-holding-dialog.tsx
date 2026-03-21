"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SymbolPickerDrawer } from "@/components/dashboard/investments/symbol-picker-drawer"
import { Loader2, Pencil, X } from "lucide-react"
import { toast } from "sonner"

const HOLDING_TYPES = [
  { value: "stock", label: "Stock" },
  { value: "etf", label: "ETF" },
  { value: "gold", label: "Gold" },
  { value: "silver", label: "Silver" },
  { value: "bond", label: "Bond" },
] as const

export interface EditHoldingInitial {
  id: string
  symbol: string
  type: string
  units: number
  costPerUnit: number
}

interface EditHoldingDialogProps {
  initial: EditHoldingInitial
  onSuccess?: () => void
}

export function EditHoldingDialog({ initial, onSuccess }: EditHoldingDialogProps) {
  const [open, setOpen] = useState(false)
  const [symbol, setSymbol] = useState(initial.symbol)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [type, setType] = useState<string>(initial.type)
  const [units, setUnits] = useState(String(initial.units))
  const [costPerUnit, setCostPerUnit] = useState<number | null>(initial.costPerUnit)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setSymbol(initial.symbol)
    setType(initial.type)
    setUnits(String(initial.units))
    setCostPerUnit(initial.costPerUnit)
  }, [open, initial])

  const effectiveSymbol =
    type === "gold" ? "Gold" : type === "silver" ? "Silver" : symbol

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const unitsNum = parseFloat(units)
    if (isNaN(unitsNum) || unitsNum < 0) {
      toast.error("Please enter a valid quantity.")
      return
    }
    const cost = costPerUnit ?? 0
    if (cost < 0) {
      toast.error("Please enter a valid cost per unit.")
      return
    }
    if ((type === "stock" || type === "etf") && !symbol.trim()) {
      toast.error("Please select a symbol.")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/investments/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: effectiveSymbol.trim(),
          type,
          units: unitsNum,
          costBasis: cost,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Failed to update holding")
      }

      toast.success("Holding updated")
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
          aria-label={`Edit holding ${initial.symbol}`}
        >
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit holding</DialogTitle>
          <DialogDescription>
            Update symbol, type, units, or average cost per unit. For sells with cash
            impact and notes, use Sell from the row actions.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-holding-type">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="edit-holding-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOLDING_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-holding-symbol">Symbol</Label>
              {type === "gold" || type === "silver" ? (
                <Input
                  id="edit-holding-symbol"
                  value={effectiveSymbol}
                  disabled
                  className="bg-muted"
                />
              ) : symbol ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md border bg-muted px-3 py-2 text-sm font-medium">
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
                  className="w-full justify-start text-muted-foreground"
                  onClick={() => setDrawerOpen(true)}
                >
                  Select symbol
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
              <Label htmlFor="edit-holding-units">Units</Label>
              <Input
                id="edit-holding-units"
                type="number"
                step="any"
                min="0"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-holding-cost">Cost per unit ($)</Label>
              <CurrencyInput
                id="edit-holding-cost"
                placeholder="0.00"
                value={costPerUnit}
                onChange={(v) => setCostPerUnit(v)}
                required
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
