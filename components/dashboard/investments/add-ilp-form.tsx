"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

interface AddIlpFormProps {
  onSuccess?: () => void
}

export function AddIlpForm({ onSuccess }: AddIlpFormProps) {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [name, setName] = useState("")
  const [monthlyPremium, setMonthlyPremium] = useState<number | null>(null)
  const [endDate, setEndDate] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProfileId && !activeFamilyId) {
      toast.error("Please select a profile or family first.")
      return
    }

    const premium = monthlyPremium ?? 0
    if (premium <= 0) {
      toast.error("Please enter a valid monthly premium.")
      return
    }

    if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      toast.error("Please enter a valid end date (YYYY-MM-DD).")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/investments/ilp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          monthlyPremium: premium,
          endDate,
          ...(activeProfileId && { profileId: activeProfileId }),
          ...(activeFamilyId && !activeProfileId && { familyId: activeFamilyId }),
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Failed to add ILP product")
      }

      toast.success("ILP product added successfully")
      setName("")
      setMonthlyPremium(null)
      setEndDate("")
      onSuccess?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="ilp-name">Product name</Label>
        <Input
          id="ilp-name"
          placeholder="e.g. Prudential ILP"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ilp-premium">Monthly premium ($)</Label>
          <CurrencyInput
            id="ilp-premium"
            placeholder="0.00"
            value={monthlyPremium}
            onChange={(v) => setMonthlyPremium(v)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ilp-end-date">End date</Label>
          <Input
            id="ilp-end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
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
          "Add ILP Product"
        )}
      </Button>
    </form>
  )
}
