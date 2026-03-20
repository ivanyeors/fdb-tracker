"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Label } from "@/components/ui/label"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { Loader2 } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

interface InvestmentAccountBalanceProps {
  onSuccess?: () => void
}

export function InvestmentAccountBalance({ onSuccess }: InvestmentAccountBalanceProps) {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [inputValue, setInputValue] = useState<number | null>(null)
  /** Row exists in DB; first submit creates the row, later submits update cash_balance. */
  const [hasAccountRow, setHasAccountRow] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    async function fetchBalance() {
      if (!activeProfileId && !activeFamilyId) {
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      try {
        const params = new URLSearchParams()
        if (activeProfileId) params.set("profileId", activeProfileId)
        else if (activeFamilyId) params.set("familyId", activeFamilyId)

        const res = await fetch(`/api/investments/account?${params}`)
        if (res.ok) {
          const json = await res.json()
          setInputValue(json.cashBalance ?? 0)
          setHasAccountRow(json.id != null)
        }
      } catch {
        toast.error("Failed to load cash balance")
      } finally {
        setIsLoading(false)
      }
    }
    fetchBalance()
  }, [activeProfileId, activeFamilyId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProfileId && !activeFamilyId) {
      toast.error("Please select a profile or family first.")
      return
    }
    const value = inputValue ?? 0
    setIsSubmitting(true)
    try {
      const res = await fetch("/api/investments/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashBalance: value,
          ...(activeProfileId && { profileId: activeProfileId }),
          ...(activeFamilyId && !activeProfileId && { familyId: activeFamilyId }),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Failed to update balance")
      }
      const saved = await res.json()
      if (saved?.id) setHasAccountRow(true)
      toast.success(hasAccountRow ? "Cash balance updated" : "Cash balance saved")
      onSuccess?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!activeProfileId && !activeFamilyId) return null

  return (
    <div className="rounded-xl border p-4">
      <h3 className="mb-4 text-sm font-medium">Investment account cash (SGD)</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Uninvested cash in your brokerage in Singapore dollars (negative balances
        allowed, e.g. GIRO). Buy deducts from this; sell adds to it. US-listed
        holdings are converted to SGD using a live FX rate elsewhere.
      </p>
      {isLoading ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[140px] flex-1 space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-[100px]" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[140px] flex-1 space-y-1.5">
            <Label htmlFor="cash-balance">Cash balance (SGD)</Label>
            <CurrencyInput
              id="cash-balance"
              placeholder="0.00"
              value={inputValue}
              onChange={setInputValue}
              allowNegativeValue
            />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving...
              </>
            ) : hasAccountRow ? (
              "Edit balance"
            ) : (
              "Set balance"
            )}
          </Button>
        </form>
      )}
    </div>
  )
}
