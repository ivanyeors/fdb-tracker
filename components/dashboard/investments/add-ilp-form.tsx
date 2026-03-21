"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
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
  const [initialFundValue, setInitialFundValue] = useState<number | null>(null)
  /** Cumulative premiums through the current month (optional; stored on the first entry). */
  const [initialPremiumsPaid, setInitialPremiumsPaid] = useState<number | null>(null)
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

      const product = await res.json()
      const fundVal = initialFundValue ?? 0
      const premVal = initialPremiumsPaid
      const familyId = product?.family_id ?? activeFamilyId
      const createInitialEntry =
        Boolean(product?.id && familyId) &&
        (fundVal > 0 || (premVal != null && premVal > 0))
      if (createInitialEntry) {
        const now = new Date()
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
        const entryRes = await fetch("/api/investments/ilp/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: product.id,
            familyId,
            month,
            fundValue: fundVal,
            premiumsPaid: premVal,
          }),
        })
        if (!entryRes.ok) {
          const err = await entryRes.json().catch(() => ({}))
          throw new Error(err.error ?? "Failed to add initial monthly entry")
        }
      }

      toast.success("ILP product added successfully")
      setName("")
      setMonthlyPremium(null)
      setEndDate("")
      setInitialFundValue(null)
      setInitialPremiumsPaid(null)
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
          <Label htmlFor="ilp-end-date">Premium end date</Label>
          <DatePicker
            id="ilp-end-date"
            value={endDate || null}
            onChange={(d) => setEndDate(d ?? "")}
            placeholder="Select end date"
            className="w-full"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ilp-initial-value">Initial fund value ($, optional)</Label>
          <CurrencyInput
            id="ilp-initial-value"
            placeholder="0.00"
            value={initialFundValue}
            onChange={(v) => setInitialFundValue(v)}
          />
          <p className="text-xs text-muted-foreground">
            If provided (or if premiums paid below is set), creates the first monthly
            snapshot for the current month.
          </p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ilp-initial-premiums">Premiums paid to date ($, optional)</Label>
          <CurrencyInput
            id="ilp-initial-premiums"
            placeholder="0.00"
            value={initialPremiumsPaid}
            onChange={(v) => setInitialPremiumsPaid(v)}
          />
          <p className="text-xs text-muted-foreground">
            Cumulative premiums through this month from your statement. Improves return
            % on the card; leave blank to estimate from monthly premium until you add a
            monthly value.
          </p>
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
