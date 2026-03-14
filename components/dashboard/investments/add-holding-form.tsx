"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SymbolCombobox } from "@/components/dashboard/investments/symbol-combobox"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { Loader2 } from "lucide-react"
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
  const [type, setType] = useState<"stock" | "etf" | "gold" | "silver" | "bond">(
    "stock",
  )
  const [units, setUnits] = useState("")
  const [costPerUnit, setCostPerUnit] = useState<number | null>(null)
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
          <Select
            value={type}
            onValueChange={(v) =>
              setType(v as "stock" | "etf" | "gold" | "silver" | "bond")
            }
          >
            <SelectTrigger id="holding-type" className="w-full">
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
          <Label htmlFor="holding-symbol">Symbol</Label>
          {type === "gold" || type === "silver" ? (
            <Input
              id="holding-symbol"
              value={effectiveSymbol}
              disabled
              className="bg-muted"
            />
          ) : (
            <SymbolCombobox
              id="holding-symbol"
              value={symbol}
              onChange={setSymbol}
              placeholder="Search by ticker or name"
            />
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="holding-units">Units</Label>
          <Input
            id="holding-units"
            type="number"
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
