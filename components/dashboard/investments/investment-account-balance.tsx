"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Label } from "@/components/ui/label"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { Loader2 } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils"

interface AccountInfo {
  id: string
  accountName: string
  cashBalance: number
}

interface InvestmentAccountBalanceProps {
  readonly onSuccess?: () => void
  /** Loaded with the rest of the investments page (SGD in DB). */
  readonly cashBalance: number
  readonly accountId: string | null
  readonly isLoading: boolean
  /** List of named investment accounts (multi-account support). */
  readonly accounts?: AccountInfo[]
  /** When set, uses this FX state instead of fetching `/api/fx/usd-sgd` (investments page dedupe). */
  readonly parentFx?: { sgdPerUsd: number | null; fxLoading: boolean }
  /** When true, omit bordered card and section heading (e.g. inside Sheet with SheetHeader). */
  readonly embedded?: boolean
}

export function InvestmentAccountBalance({
  onSuccess,
  cashBalance,
  accountId,
  isLoading,
  accounts,
  parentFx,
  embedded = false,
}: InvestmentAccountBalanceProps) {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [inputUsd, setInputUsd] = useState<number | null>(null)
  const [hasAccountRow, setHasAccountRow] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sgdPerUsdInternal, setSgdPerUsdInternal] = useState<number | null>(null)
  const [fxLoadingInternal, setFxLoadingInternal] = useState(true)

  const useParentFx = parentFx != null
  const sgdPerUsd = useParentFx ? parentFx.sgdPerUsd : sgdPerUsdInternal
  const fxLoading = useParentFx ? parentFx.fxLoading : fxLoadingInternal

  useEffect(() => {
    if (useParentFx) return
    let cancelled = false
    async function loadFx() {
      setFxLoadingInternal(true)
      try {
        const r = await fetch("/api/fx/usd-sgd")
        const j = r.ok ? await r.json() : { sgdPerUsd: null }
        if (!cancelled) setSgdPerUsdInternal(j.sgdPerUsd ?? null)
      } finally {
        if (!cancelled) setFxLoadingInternal(false)
      }
    }
    void loadFx()
    return () => {
      cancelled = true
    }
  }, [useParentFx])

  useEffect(() => {
    if (isLoading || fxLoading) return
    setHasAccountRow(accountId != null)
    if (sgdPerUsd != null && sgdPerUsd > 0) {
      setInputUsd(Math.round((cashBalance / sgdPerUsd) * 100) / 100)
    } else {
      setInputUsd(0)
    }
  }, [cashBalance, accountId, isLoading, fxLoading, sgdPerUsd])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProfileId && !activeFamilyId) {
      toast.error("Please select a profile or family first.")
      return
    }
    if (sgdPerUsd == null || sgdPerUsd <= 0) {
      toast.error("USD/SGD rate unavailable. Try again later.")
      return
    }
    const cashSgd = Math.round((inputUsd ?? 0) * sgdPerUsd * 100) / 100
    setIsSubmitting(true)
    try {
      const res = await fetch("/api/investments/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashBalance: cashSgd,
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

  const sgdEquivalent =
    sgdPerUsd != null &&
    sgdPerUsd > 0 &&
    inputUsd != null &&
    Number.isFinite(inputUsd)
      ? Math.round(inputUsd * sgdPerUsd * 100) / 100
      : null

  const showSkeleton = isLoading || fxLoading

  const hasMultipleAccounts = accounts && accounts.length > 1

  const body = (
    <>
      {embedded ? null : (
        <h3 className="mb-4 text-sm font-medium">Cash balance</h3>
      )}
      {hasMultipleAccounts && !showSkeleton ? (
        <div className="mb-3 space-y-1.5">
          {accounts.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-1.5 text-xs"
            >
              <span className="font-medium">{a.accountName}</span>
              <span className="tabular-nums text-muted-foreground">
                ${formatCurrency(a.cashBalance)} SGD
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <p className="mb-3 text-xs text-muted-foreground">
        Enter uninvested brokerage cash in USD; we store the SGD equivalent for
        portfolio totals (negative balances allowed, e.g. GIRO). Buy/sell flows
        still update the same SGD balance.
        {!activeProfileId && activeFamilyId ? (
          <>
            {" "}
            Family view shows total brokerage cash. Saving replaces that total:
            per-profile cash rows are cleared and the full amount is stored on
            the shared account (same total the charts use).
          </>
        ) : null}
      </p>
      {showSkeleton ? (
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
            <Label htmlFor="cash-balance">Cash balance (USD)</Label>
            <CurrencyInput
              id="cash-balance"
              placeholder="0.00"
              value={inputUsd}
              onChange={setInputUsd}
              allowNegativeValue
              disabled={sgdPerUsd == null || sgdPerUsd <= 0}
            />
            {sgdEquivalent == null ? null : (
              <p className="text-xs text-muted-foreground tabular-nums">
                ≈ ${formatCurrency(sgdEquivalent)} SGD stored
              </p>
            )}
            {sgdPerUsd == null ? (
              <p className="text-xs text-destructive">Could not load USD/SGD rate.</p>
            ) : null}
          </div>
          <Button
            type="submit"
            disabled={isSubmitting || sgdPerUsd == null || sgdPerUsd <= 0}
          >
            {(() => {
              if (isSubmitting) {
                return (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving...
              </>
                )
              }
              return hasAccountRow ? "Edit balance" : "Set balance"
            })()}
          </Button>
        </form>
      )}
    </>
  )

  if (embedded) {
    return <div>{body}</div>
  }

  return <div className="rounded-xl border p-4">{body}</div>
}
