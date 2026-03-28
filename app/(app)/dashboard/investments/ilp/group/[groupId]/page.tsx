"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { SectionHeader } from "@/components/dashboard/section-header"
import { Button } from "@/components/ui/button"
import { IlpCard } from "@/components/dashboard/investments/ilp-card"
import { IlpGroupFundsEditSheet } from "@/components/dashboard/investments/ilp-group-funds-edit-sheet"
import { useActiveProfile } from "@/hooks/use-active-profile"
import {
  buildIlpCardDataFromProduct,
  type IlpProductWithEntries,
} from "@/lib/investments/ilp-product-to-card-data"
import {
  InvestmentsDisplayCurrencyProvider,
  InvestmentsCurrencyToggle,
} from "@/components/dashboard/investments/investments-display-currency"
import { IlpGroupAllocationPanel } from "@/components/dashboard/investments/ilp-group-allocation-panel"
import { DeleteIlpGroupDialog } from "@/components/dashboard/investments/delete-ilp-group-dialog"
import { ChartSkeleton } from "@/components/loading"

export default function IlpFundGroupDetailPage() {
  const params = useParams()
  const groupId = typeof params.groupId === "string" ? params.groupId : ""
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [ilpProducts, setIlpProducts] = useState<IlpProductWithEntries[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editGroupOpen, setEditGroupOpen] = useState(false)
  const [sgdPerUsd, setSgdPerUsd] = useState<number | null>(null)
  const [fxLoading, setFxLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadFx() {
      setFxLoading(true)
      try {
        const r = await fetch("/api/fx/usd-sgd")
        const j = r.ok ? await r.json() : { sgdPerUsd: null }
        if (!cancelled) setSgdPerUsd(j.sgdPerUsd ?? null)
      } catch {
        if (!cancelled) setSgdPerUsd(null)
      } finally {
        if (!cancelled) setFxLoading(false)
      }
    }
    void loadFx()
    return () => {
      cancelled = true
    }
  }, [])

  const fetchIlp = useCallback(async () => {
    if (!activeProfileId && !activeFamilyId) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const q = new URLSearchParams()
      if (activeProfileId) q.set("profileId", activeProfileId)
      else if (activeFamilyId) q.set("familyId", activeFamilyId)
      const r = await fetch(`/api/investments/ilp?${q}`)
      if (r.ok) {
        const products = (await r.json()) as IlpProductWithEntries[]
        setIlpProducts(products)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }, [activeProfileId, activeFamilyId])

  useEffect(() => {
    void fetchIlp()
  }, [fetchIlp])

  const groupCards = useMemo(() => {
    const inGroup = ilpProducts.filter((p) => p.ilp_fund_groups?.id === groupId)
    return inGroup.map((p) => buildIlpCardDataFromProduct(p))
  }, [ilpProducts, groupId])

  const groupTitle = useMemo(() => {
    const first = ilpProducts.find((p) => p.ilp_fund_groups?.id === groupId)
    return first?.ilp_fund_groups?.name ?? "Fund group"
  }, [ilpProducts, groupId])

  const firstInGroup = useMemo(
    () => ilpProducts.find((p) => p.ilp_fund_groups?.id === groupId),
    [ilpProducts, groupId],
  )
  const groupPremiumAmount = firstInGroup?.ilp_fund_groups?.group_premium_amount
  const groupPremiumMode =
    firstInGroup?.ilp_fund_groups?.premium_payment_mode === "one_time"
      ? "one_time"
      : "monthly"

  const productsForEdit = useMemo(
    () =>
      groupCards.map((c) => ({
        id: c.productId,
        name: c.name,
        group_allocation_pct: c.groupAllocationPct,
        fundValue: c.fundValue,
      })),
    [groupCards],
  )

  const groupAllocationMembers = useMemo(
    () =>
      groupCards.map((c) => ({
        name: c.name,
        fundValue: c.fundValueForAllocation,
        fundReportSnapshot: c.fundReportSnapshot,
      })),
    [groupCards],
  )

  const totalIlpAcrossProducts = useMemo(
    () =>
      ilpProducts.reduce(
        (s, p) => s + (p.latestEntry?.fund_value ?? 0),
        0,
      ),
    [ilpProducts],
  )

  if (!activeProfileId && !activeFamilyId) {
    return (
      <InvestmentsDisplayCurrencyProvider
        sgdPerUsd={sgdPerUsd}
        fxLoading={fxLoading}
      >
        <div className="space-y-6 p-4 sm:p-6">
          <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
            Please select a profile first.
          </div>
        </div>
      </InvestmentsDisplayCurrencyProvider>
    )
  }

  return (
    <InvestmentsDisplayCurrencyProvider
      sgdPerUsd={sgdPerUsd}
      fxLoading={fxLoading}
    >
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1">
            <Link href="/dashboard/investments?tab=ilp">
              <ArrowLeft className="size-4" />
              ILP tab
            </Link>
          </Button>
          <InvestmentsCurrencyToggle />
        </div>

        <SectionHeader
          title={groupTitle}
          description="Funds in this group. Monthly values, returns, and imported report details."
        >
          {!isLoading ? (
            <div className="flex items-center gap-2">
              <Button type="button" onClick={() => setEditGroupOpen(true)}>
                Edit group funds
              </Button>
              <DeleteIlpGroupDialog
                groupId={groupId}
                groupName={groupTitle}
                fundCount={groupCards.length}
              />
            </div>
          ) : null}
        </SectionHeader>

        <IlpGroupFundsEditSheet
          open={editGroupOpen}
          onOpenChange={setEditGroupOpen}
          groupId={groupId}
          groupName={groupTitle}
          groupPremiumAmount={
            groupPremiumAmount != null && Number.isFinite(Number(groupPremiumAmount))
              ? Number(groupPremiumAmount)
              : null
          }
          premiumPaymentMode={groupPremiumMode}
          products={productsForEdit}
          onSuccess={() => void fetchIlp()}
        />

        {!isLoading && groupCards.length > 0 ? (
          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <h2 className="text-sm font-medium text-foreground">Group allocation</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The companies and By sector views use the portfolio holdings table from each
              imported report; Fund category uses each fund’s Morningstar category line
              from the report header.
            </p>
            <div className="mt-3">
              <IlpGroupAllocationPanel
                key={groupId}
                members={groupAllocationMembers}
                fullPortfolioTotal={totalIlpAcrossProducts}
                chartHeight={320}
                legendMaxItems={8}
                percentOfWhat="ILP portfolio"
                variant="default"
              />
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <ChartSkeleton height={240} className="rounded-xl" />
            <ChartSkeleton height={240} className="rounded-xl" />
          </div>
        ) : groupCards.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
            No funds in this group, or the group was removed.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {groupCards.map((card) => (
              <IlpCard
                key={card.productId}
                productId={card.productId}
                name={card.name}
                fundValue={card.fundValue}
                totalPremiumsPaid={card.totalPremiumsPaid}
                premiumsSource={card.premiumsSource}
                returnPct={card.returnPct}
                monthlyPremium={card.monthlyPremium}
                premiumPaymentMode={card.premiumPaymentMode}
                groupPremiumAmount={card.groupPremiumAmount}
                endDate={card.endDate}
                latestEntryMonth={card.latestEntryMonth}
                latestEntryFundValue={card.latestEntryFundValue}
                latestEntryPremiumsPaid={card.latestEntryPremiumsPaid}
                profileId={card.profileId}
                monthlyData={card.monthlyData}
                fundReportSnapshot={card.fundReportSnapshot}
                groupAllocationPct={card.groupAllocationPct}
                onAddEntry={fetchIlp}
                onEditSuccess={fetchIlp}
                showAddMonthlyEntry={false}
                showDeleteProduct={false}
              />
            ))}
          </div>
        )}
      </div>
    </InvestmentsDisplayCurrencyProvider>
  )
}
