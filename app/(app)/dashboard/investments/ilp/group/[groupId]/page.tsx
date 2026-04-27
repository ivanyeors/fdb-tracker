"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, RefreshCw, User } from "lucide-react"
import { toast } from "sonner"
import { SectionHeader } from "@/components/dashboard/section-header"
import { Button } from "@/components/ui/button"
import { MetricCard } from "@/components/dashboard/metric-card"
import { CurrencyInput } from "@/components/ui/currency-input"
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
import { buildGroupSummary } from "@/lib/investments/ilp-group-summary"
import { formatCurrency } from "@/lib/utils"

export default function IlpFundGroupDetailPage() {
  const params = useParams()
  const groupId = typeof params.groupId === "string" ? params.groupId : ""
  const { activeProfileId, activeFamilyId, profiles } = useActiveProfile()
  const [ilpProducts, setIlpProducts] = useState<IlpProductWithEntries[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editGroupOpen, setEditGroupOpen] = useState(false)
  const [sgdPerUsd, setSgdPerUsd] = useState<number | null>(null)
  const [fxLoading, setFxLoading] = useState(true)
  const [premiumInput, setPremiumInput] = useState<number | null>(null)
  const [premiumSaving, setPremiumSaving] = useState(false)
  const [totalInvestedInput, setTotalInvestedInput] = useState<number | null>(null)
  const [totalInvestedSaving, setTotalInvestedSaving] = useState(false)
  const [groupProfileId, setGroupProfileId] = useState<string | null>(null)

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

  // Fetch group details (for profile_id)
  const fetchGroupDetails = useCallback(async () => {
    if (!activeFamilyId) return
    try {
      const r = await fetch(`/api/investments/ilp/groups?familyId=${activeFamilyId}`)
      if (r.ok) {
        const groups = await r.json()
        const group = groups.find((g: { id: string }) => g.id === groupId)
        if (group) setGroupProfileId(group.profile_id ?? null)
      }
    } catch { /* ignore */ }
  }, [activeFamilyId, groupId])

  useEffect(() => {
    void fetchGroupDetails()
  }, [fetchGroupDetails])

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
    const inGroup = ilpProducts.filter((p) =>
      p.fund_group_memberships?.some((m) => m.group_id === groupId),
    )
    return inGroup.map((p) => buildIlpCardDataFromProduct(p, groupId))
  }, [ilpProducts, groupId])

  const groupTitle = useMemo(() => {
    for (const p of ilpProducts) {
      const m = p.fund_group_memberships?.find((m) => m.group_id === groupId)
      if (m) return m.group_name || "Fund group"
    }
    return "Fund group"
  }, [ilpProducts, groupId])

  const firstMembership = useMemo(() => {
    for (const p of ilpProducts) {
      const m = p.fund_group_memberships?.find((m) => m.group_id === groupId)
      if (m) return m
    }
    return null
  }, [ilpProducts, groupId])
  const groupPremiumAmount = firstMembership?.group_premium_amount
  const groupPremiumMode =
    firstMembership?.premium_payment_mode === "one_time"
      ? "one_time"
      : "monthly"

  // Sync groupProfileId from membership data (authoritative after fetchIlp)
  useEffect(() => {
    if (firstMembership?.group_profile_id !== undefined) {
      setGroupProfileId(firstMembership.group_profile_id ?? null)
    }
  }, [firstMembership])

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

  const groupSummary = useMemo(() => {
    const productsForSummary = ilpProducts
      .filter((p) => p.fund_group_memberships?.some((m) => m.group_id === groupId))
      .map((p) => ({
        id: p.id,
        name: p.name,
        entries: (p.entries ?? []).map((e) => ({
          month: e.month,
          fund_value: e.fund_value,
          premiums_paid: e.premiums_paid ?? null,
        })),
        fund_group_memberships: p.fund_group_memberships?.map((m) => ({
          group_id: m.group_id,
          allocation_pct: m.allocation_pct,
        })),
      }))
    return buildGroupSummary(productsForSummary, groupId)
  }, [ilpProducts, groupId])

  const handlePremiumUpdate = useCallback(async () => {
    if (premiumInput == null || premiumInput <= 0 || !activeFamilyId) return
    setPremiumSaving(true)
    try {
      const res = await fetch(`/api/investments/ilp/groups/${groupId}/monthly-premium`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId: activeFamilyId, monthlyTotal: premiumInput }),
      })
      if (!res.ok) throw new Error("Failed to update")
      toast.success("Monthly premium updated and individual amounts recalculated")
      void fetchIlp()
    } catch {
      toast.error("Failed to update monthly premium")
    } finally {
      setPremiumSaving(false)
    }
  }, [premiumInput, activeFamilyId, groupId, fetchIlp])

  const handleTotalInvestedUpdate = useCallback(async () => {
    if (totalInvestedInput == null || totalInvestedInput < 0 || !activeFamilyId) return
    setTotalInvestedSaving(true)
    try {
      const res = await fetch(`/api/investments/ilp/groups/${groupId}/total-invested`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId: activeFamilyId, totalInvested: totalInvestedInput }),
      })
      if (!res.ok) throw new Error("Failed to update")
      toast.success("Total invested updated and individual premiums paid recalculated")
      void fetchIlp()
    } catch {
      toast.error("Failed to update total invested")
    } finally {
      setTotalInvestedSaving(false)
    }
  }, [totalInvestedInput, activeFamilyId, groupId, fetchIlp])

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
            <div className="flex flex-wrap items-center gap-2">
              {groupProfileId && (
                <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
                  <User className="size-3" />
                  {profiles.find((p) => p.id === groupProfileId)?.name ?? "Assigned"}
                </span>
              )}
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
          onSuccess={() => { void fetchIlp(); void fetchGroupDetails() }}
          groupProfileId={groupProfileId}
        />

        {/* Group Summary Cards */}
        {!isLoading && groupCards.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <MetricCard
                label="Total Invested"
                value={groupSummary.totalPremiumsPaid}
                prefix="$"
                trend={0}
                trendLabel=""
              />
              <MetricCard
                label="Total Fund Value"
                value={groupSummary.totalFundValue}
                prefix="$"
                trend={0}
                trendLabel=""
              />
              <MetricCard
                label="Return"
                value={groupSummary.returnPct}
                suffix="%"
                trend={0}
                trendLabel=""
              />
              <MetricCard
                label="Monthly Change"
                value={groupSummary.monthlyVariance.length > 0
                  ? groupSummary.monthlyVariance.at(-1)!.deltaFromPrevious
                  : 0}
                prefix="$"
                trend={0}
                trendLabel=""
              />
            </div>

            {/* Total Invested Update */}
            <div className="rounded-xl border bg-card p-4 sm:p-5">
              <h2 className="text-sm font-medium text-foreground">Total Invested</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Update the total premiums paid across the group. Each fund&apos;s premiums paid will be recalculated based on their allocation %.
              </p>
              <div className="mt-3 flex items-end gap-3">
                <div className="flex-1 max-w-[200px]">
                  <CurrencyInput
                    value={totalInvestedInput ?? (groupSummary.totalPremiumsPaid > 0 ? groupSummary.totalPremiumsPaid : null)}
                    onChange={(v) => setTotalInvestedInput(v ?? null)}
                    placeholder={groupSummary.totalPremiumsPaid > 0 ? `$${formatCurrency(groupSummary.totalPremiumsPaid)}` : "0.00"}
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleTotalInvestedUpdate}
                  disabled={totalInvestedSaving || totalInvestedInput == null || totalInvestedInput < 0}
                >
                  {totalInvestedSaving ? <RefreshCw className="size-4 animate-spin" /> : "Update"}
                </Button>
              </div>
            </div>

            {/* Monthly Premium Update */}
            <div className="rounded-xl border bg-card p-4 sm:p-5">
              <h2 className="text-sm font-medium text-foreground">Monthly Group Premium</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Update the total monthly amount. Individual fund premiums will be recalculated based on their allocation %.
              </p>
              <div className="mt-3 flex items-end gap-3">
                <div className="flex-1 max-w-[200px]">
                  <CurrencyInput
                    value={premiumInput ?? (groupPremiumAmount != null ? Number(groupPremiumAmount) : null)}
                    onChange={(v) => setPremiumInput(v ?? null)}
                    placeholder={groupPremiumAmount != null ? `$${formatCurrency(Number(groupPremiumAmount))}` : "0.00"}
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handlePremiumUpdate}
                  disabled={premiumSaving || premiumInput == null || premiumInput <= 0}
                >
                  {premiumSaving ? <RefreshCw className="size-4 animate-spin" /> : "Recalculate"}
                </Button>
              </div>
              {groupSummary.individualBreakdowns.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-1.5 pr-3 font-medium">Fund</th>
                        <th className="pb-1.5 pr-3 text-right font-medium">Allocation</th>
                        <th className="pb-1.5 pr-3 text-right font-medium">Premiums Paid</th>
                        <th className="pb-1.5 pr-3 text-right font-medium">Fund Value</th>
                        <th className="pb-1.5 text-right font-medium">Return</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupSummary.individualBreakdowns.map((p) => (
                        <tr key={p.productId} className="border-b last:border-0">
                          <td className="py-1.5 pr-3 font-medium truncate max-w-[150px]">{p.name}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{p.allocationPct.toFixed(1)}%</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">${formatCurrency(p.premiumsPaid)}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">${formatCurrency(p.fundValue)}</td>
                          <td className={`py-1.5 text-right tabular-nums ${p.returnPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                            {p.returnPct >= 0 ? "+" : ""}{p.returnPct.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {!isLoading && groupCards.length > 0 ? (
          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <h2 className="text-sm font-medium text-foreground">Group allocation</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The portfolio holdings view uses the holdings table from each imported report,
              aggregated across all funds in this group. Fund category uses each fund’s
              Morningstar category from the report header.
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

        {(() => {
          if (isLoading) {
            return (
          <div className="grid gap-4 md:grid-cols-2">
            <ChartSkeleton height={240} className="rounded-xl" />
            <ChartSkeleton height={240} className="rounded-xl" />
          </div>
            )
          }
          if (groupCards.length === 0) {
            return (
          <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
            No funds in this group, or the group was removed.
          </div>
            )
          }
          return (
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
          )
        })()}
      </div>
    </InvestmentsDisplayCurrencyProvider>
  )
}
