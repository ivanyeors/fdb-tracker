"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ButtonSelect } from "@/components/ui/button-select"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

interface AddMetalFormProps {
  readonly onSuccess?: () => void
}

export function AddMetalForm({ onSuccess }: AddMetalFormProps) {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [type, setType] = useState<"gold" | "silver">("gold")
  const [units, setUnits] = useState("")
  const [costPerOz, setCostPerOz] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const symbol = type === "gold" ? "Gold" : "Silver"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProfileId && !activeFamilyId) {
      toast.error("Please select a profile or family first.")
      return
    }

    const unitsNum = Number.parseFloat(units)
    if (Number.isNaN(unitsNum) || unitsNum <= 0) {
      toast.error("Please enter a valid quantity (oz).")
      return
    }

    const cost = costPerOz ?? 0
    if (cost < 0) {
      toast.error("Please enter a valid cost per oz.")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
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

      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} holding added successfully`)
      setUnits("")
      setCostPerOz(null)
      onSuccess?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="metal-type">Type</Label>
          <ButtonSelect
            value={type}
            onValueChange={(v) => setType(v as "gold" | "silver")}
            options={[
              { value: "gold", label: "Gold" },
              { value: "silver", label: "Silver" },
            ]}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="metal-units">Units (oz)</Label>
          <Input
            id="metal-units"
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
          <Label htmlFor="metal-cost">Cost per oz ($)</Label>
          <CurrencyInput
            id="metal-cost"
            placeholder="0.00"
            value={costPerOz}
            onChange={(v) => setCostPerOz(v)}
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
