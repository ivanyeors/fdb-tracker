"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { SectionHeader } from "@/components/dashboard/section-header"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs"
import {
  HoldingsTable,
  type Holding,
  type HoldingGroup,
} from "@/components/dashboard/investments/holdings-table"
import { HoldingDetailSheet } from "@/components/dashboard/investments/holding-detail-sheet"
import { groupHoldings } from "@/lib/investments/group-holdings"
import { AllocationChart } from "@/components/dashboard/investments/allocation-chart"
import { IlpCard } from "@/components/dashboard/investments/ilp-card"
import { IlpGroupSummaryCard } from "@/components/dashboard/investments/ilp-group-summary-card"
import { PreciousMetals } from "@/components/dashboard/investments/precious-metals"
import { AddHoldingForm } from "@/components/dashboard/investments/add-holding-form"
import { InvestmentAccountBalance } from "@/components/dashboard/investments/investment-account-balance"
import { AddIlpForm } from "@/components/dashboard/investments/add-ilp-form"
import { AddMetalForm } from "@/components/dashboard/investments/add-metal-form"
import { InvestmentValueChart } from "@/components/dashboard/investments/investment-value-chart"
import {
  JournalList,
  type JournalEntry,
} from "@/components/dashboard/investments/journal-list"
import { ChartSkeleton } from "@/components/loading"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  currentMonthYm,
  ilpEntryMonthKey,
} from "@/lib/investments/ilp-chart"
import { valuateGold, valuateSilver } from "@/lib/calculations/precious-metals"
import {
  allocationByIlpGroupOrStandalone,
  allocationByIlpProductWithGroupLabel,
} from "@/lib/investments/ilp-allocation-aggregate"
import { fundValueForAllocation } from "@/lib/investments/ilp-fund-value-for-allocation"
import {
  InvestmentsDisplayCurrencyProvider,
  InvestmentsCurrencyToggle,
} from "@/components/dashboard/investments/investments-display-currency"

type IlpProductWithEntries = {
  id: string
  name: string
  monthly_premium: number
  premium_payment_mode?: string | null
  end_date: string
  created_at: string
  group_allocation_pct?: number | null
  ilp_fund_groups?: {
    id: string
    name: string
    group_premium_amount?: number | null
    premium_payment_mode?: string | null
  } | null
  latestEntry: {
    fund_value: number
    month: string
    premiums_paid?: number | null
    fund_report_snapshot?: Record<string, unknown> | null
  } | null
  entries: {
    month: string
    fund_value: number
    premiums_paid?: number | null
    fund_report_snapshot?: Record<string, unknown> | null
  }[]
}

function mapToCategoryLabel(type: string): string {
  return type === "stock"
    ? "Stocks"
    : type === "etf"
      ? "ETF"
      : type === "gold"
        ? "Gold"
        : type === "silver"
          ? "Silver"
          : type === "ilp"
            ? "ILP"
            : type === "bond"
              ? "Bonds"
              : type.charAt(0).toUpperCase() + type.slice(1)
}

function mapToMarketLabel(symbol: string, type: string): string {
  if (type === "gold" || type === "silver") return "Precious Metals"
  if (type === "ilp") return "ILP"
  const s = symbol.trim().toUpperCase()
  if (s.endsWith(".SI") || s.endsWith(".SG")) return "SGX"
  return "US"
}

/** One donut slice per ticker / metal type (merged if duplicate symbols). */
function holdingDonutLabel(symbol: string, type: string): string {
  if (type === "gold" || type === "silver") return mapToCategoryLabel(type)
  const s = symbol.trim()
  if (s.length > 0) return s.toUpperCase()
  return mapToCategoryLabel(type)
}

const INVESTMENTS_TAB_SET = new Set([
  "holdings",
  "allocation",
  "ilp",
  "metals",
  "activity",
])

export default function InvestmentsDetailPage() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const defaultTab =
    tabParam && INVESTMENTS_TAB_SET.has(tabParam) ? tabParam : "holdings"

  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [ilpProducts, setIlpProducts] = useState<IlpProductWithEntries[]>([])
  const [metalsPrices, setMetalsPrices] = useState<
    { metalType: string; buyPriceSgd: number; sellPriceSgd: number }[]
  >([])
  const [cashBalance, setCashBalance] = useState(0)
  const [accountRowId, setAccountRowId] = useState<string | null>(null)
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sgdPerUsd, setSgdPerUsd] = useState<number | null>(null)
  const [fxLoading, setFxLoading] = useState(true)
  const [holdingDetail, setHoldingDetail] = useState<HoldingGroup | null>(null)
  const [addIlpOpen, setAddIlpOpen] = useState(false)
  const [cashBalanceOpen, setCashBalanceOpen] = useState(false)
  const [addHoldingOpen, setAddHoldingOpen] = useState(false)
  const [ilpSelectedIds, setIlpSelectedIds] = useState<string[]>([])
  const [ilpBulkDeleteOpen, setIlpBulkDeleteOpen] = useState(false)
  const [ilpBulkDeleting, setIlpBulkDeleting] = useState(false)
  const ilpSelectAllRef = useRef<HTMLInputElement>(null)

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

  const fetchData = useCallback(async () => {
    if (!activeProfileId && !activeFamilyId) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (activeProfileId) params.set("profileId", activeProfileId)
      else if (activeFamilyId) params.set("familyId", activeFamilyId)

      const [invRes, ilpRes, pricesRes, accountRes, txRes] = await Promise.all([
        fetch(`/api/investments?${params}`),
        fetch(`/api/investments/ilp?${params}`),
        fetch("/api/prices?metals=true"),
        fetch(`/api/investments/account?${params}`),
        fetch(`/api/investments/transactions?${params}&limit=100`),
      ])

      if (invRes.ok) {
        const payload = (await invRes.json()) as
          | Array<{
              id: string
              symbol: string
              type: string
              units: number
              cost_basis: number
              cost_basis_usd?: number | null
              marketValue?: number | null
              currentPrice?: number | null
              unrealisedPnL?: number | null
              unrealisedPnLPct?: number | null
              pricingSource?: "live" | "none"
              created_at: string
            }>
          | {
              investments: Array<{
                id: string
                symbol: string
                type: string
                units: number
                cost_basis: number
                cost_basis_usd?: number | null
                marketValue?: number | null
                currentPrice?: number | null
                unrealisedPnL?: number | null
                unrealisedPnLPct?: number | null
                pricingSource?: "live" | "none"
                created_at: string
              }>
              sgdPerUsd: number | null
            }
        const list = Array.isArray(payload) ? payload : payload.investments
        const rateFromInv = Array.isArray(payload) ? null : payload.sgdPerUsd
        if (rateFromInv != null && rateFromInv > 0) {
          setSgdPerUsd(rateFromInv)
        }
        const mapped: Holding[] = list.map((inv) => {
            const mv = inv.marketValue
            const hasLive =
              inv.pricingSource === "live" &&
              mv != null &&
              Number.isFinite(mv) &&
              mv > 0
            const cp =
              inv.currentPrice != null &&
              Number.isFinite(inv.currentPrice) &&
              inv.currentPrice > 0
                ? inv.currentPrice
                : null
            const rate = rateFromInv != null && rateFromInv > 0 ? rateFromInv : null
            /** API returns USD for live price / P&L; Holding stores SGD for display + currency toggle. */
            const currentValueSgd =
              hasLive && mv != null && rate ? mv * rate : null
            const pnlSgd =
              hasLive && inv.unrealisedPnL != null && rate
                ? inv.unrealisedPnL * rate
                : null
            const currentPriceSgd =
              cp != null && rate ? cp * rate : null
            return {
              id: inv.id,
              symbol: inv.symbol,
              type: inv.type,
              units: inv.units,
              costPerUnit: inv.cost_basis,
              costBasis: inv.cost_basis * inv.units,
              currentPrice: currentPriceSgd,
              currentValue: currentValueSgd,
              pnl: pnlSgd,
              pnlPct:
                hasLive && inv.unrealisedPnLPct != null
                  ? inv.unrealisedPnLPct
                  : null,
              portfolioPct: 0,
              createdAt: inv.created_at,
            }
          })
        const finalHoldings = mapped.map((h) => ({
          ...h,
          portfolioPct: 0,
        }))
        setHoldings(finalHoldings)
      }

      if (ilpRes.ok) {
        const products = await ilpRes.json()
        const productsWithEntries = products.map(
          (p: {
            id: string
            name: string
            monthly_premium: number
            end_date: string
            created_at: string
            group_allocation_pct?: number | null
            ilp_fund_groups?: { id: string; name: string } | null
            latestEntry: {
              fund_value: number
              month: string
              premiums_paid?: number | null
              fund_report_snapshot?: Record<string, unknown> | null
            } | null
            entries?: {
              month: string
              fund_value: number
              premiums_paid?: number | null
              fund_report_snapshot?: Record<string, unknown> | null
            }[]
          }) => ({
            ...p,
            entries: p.entries ?? [],
          }),
        )
        setIlpProducts(productsWithEntries)
      }

      if (pricesRes.ok) {
        const { metals } = await pricesRes.json()
        setMetalsPrices(
          (metals ?? []).map(
            (m: {
              metalType: string
              buyPriceSgd: number
              sellPriceSgd: number
            }) => ({
              metalType: m.metalType,
              buyPriceSgd: m.buyPriceSgd,
              sellPriceSgd: m.sellPriceSgd,
            }),
          ),
        )
      }

      if (accountRes.ok) {
        const acc = await accountRes.json()
        setCashBalance(acc.cashBalance ?? 0)
        setAccountRowId(acc.id ?? null)
      }

      if (txRes.ok) {
        const txJson = await txRes.json()
        const mapped: JournalEntry[] = (txJson as unknown[]).map((row) => {
          const r = row as {
            id: string
            symbol: string
            type: string
            quantity: number
            price: number
            journal_text?: string | null
            screenshot_url?: string | null
            created_at: string
          }
          return {
            id: r.id,
            symbol: r.symbol,
            type: r.type as "buy" | "sell",
            quantity: r.quantity,
            price: r.price,
            journalText: r.journal_text ?? undefined,
            screenshotUrl: r.screenshot_url ?? undefined,
            date: r.created_at,
          }
        })
        setJournalEntries(mapped)
      } else {
        setJournalEntries([])
      }
    } catch (error) {
      console.error("Failed to fetch investments detail:", error)
    } finally {
      setIsLoading(false)
    }
  }, [activeProfileId, activeFamilyId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /** Live market values are USD; convert to SGD for totals with cash / ILP. */
  const totalValue = useMemo(
    () =>
      holdings.reduce((sum, h) => sum + (h.currentValue ?? 0), 0),
    [holdings],
  )

  const ilpTotalSum = useMemo(
    () =>
      ilpProducts.reduce(
        (s, p) => s + (p.latestEntry?.fund_value ?? 0),
        0,
      ),
    [ilpProducts],
  )

  /** Matches computeTotalInvestmentsValue: cash + live holdings + ILP. */
  const fullPortfolioTotal = useMemo(
    () => cashBalance + totalValue + ilpTotalSum,
    [cashBalance, totalValue, ilpTotalSum],
  )

  const holdingGroups = useMemo(() => groupHoldings(holdings), [holdings])

  const allocationByType = useMemo(() => {
    const grouped = new Map<string, number>()
    holdings.forEach((h) => {
      const label = mapToCategoryLabel(h.type)
      grouped.set(
        label,
        (grouped.get(label) || 0) + (h.currentValue ?? 0),
      )
    })
    if (cashBalance > 0) {
      grouped.set(
        "Cash balance",
        (grouped.get("Cash balance") || 0) + cashBalance,
      )
    }
    const denom = fullPortfolioTotal > 0 ? fullPortfolioTotal : 1
    return Array.from(grouped.entries())
      .map(([name, value]) => ({
        name,
        value,
        percentage: (value / denom) * 100,
      }))
      .sort((a, b) => b.value - a.value)
  }, [holdings, cashBalance, fullPortfolioTotal])

  /** Hero donut: listed holdings + positive brokerage cash (pie cannot slice negatives). */
  const allocationByHolding = useMemo(() => {
    const grouped = new Map<string, number>()
    holdings.forEach((h) => {
      const label = holdingDonutLabel(h.symbol, h.type)
      grouped.set(
        label,
        (grouped.get(label) || 0) + (h.currentValue ?? 0),
      )
    })
    if (cashBalance > 0) {
      grouped.set(
        "Cash balance",
        (grouped.get("Cash balance") || 0) + cashBalance,
      )
    }
    const denom = fullPortfolioTotal > 0 ? fullPortfolioTotal : 1
    return Array.from(grouped.entries())
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({
        name,
        value,
        percentage: (value / denom) * 100,
      }))
      .sort((a, b) => b.value - a.value)
  }, [holdings, cashBalance, fullPortfolioTotal])

  const allocationByMarket = useMemo(() => {
    const grouped = new Map<string, number>()
    holdings.forEach((h) => {
      const label = mapToMarketLabel(h.symbol, h.type)
      grouped.set(
        label,
        (grouped.get(label) || 0) + (h.currentValue ?? 0),
      )
    })
    if (cashBalance > 0) {
      grouped.set(
        "Cash balance",
        (grouped.get("Cash balance") || 0) + cashBalance,
      )
    }
    const ilpMarketSlices = allocationByIlpGroupOrStandalone(
      ilpProducts.map((p) => ({
        name: p.name,
        latestEntry: p.latestEntry,
        ilp_fund_groups: p.ilp_fund_groups
          ? { id: p.ilp_fund_groups.id, name: p.ilp_fund_groups.name }
          : null,
      })),
    )
    for (const row of ilpMarketSlices) {
      const label = `ILP · ${row.name}`
      grouped.set(label, (grouped.get(label) || 0) + row.value)
    }
    const denom = fullPortfolioTotal > 0 ? fullPortfolioTotal : 1
    return Array.from(grouped.entries())
      .map(([name, value]) => ({
        name,
        value,
        percentage: (value / denom) * 100,
      }))
      .sort((a, b) => b.value - a.value)
  }, [holdings, ilpProducts, cashBalance, fullPortfolioTotal])

  /** One slice per ILP product (so grouped funds show multiple segments); label is `Group · Fund` when assigned. */
  const ilpDonutSlices = useMemo(
    () =>
      allocationByIlpProductWithGroupLabel(
        ilpProducts.map((p) => ({
          name: p.name,
          latestEntry: p.latestEntry,
          ilp_fund_groups: p.ilp_fund_groups
            ? { id: p.ilp_fund_groups.id, name: p.ilp_fund_groups.name }
            : null,
        })),
      ),
    [ilpProducts],
  )

  const metalsHoldings = useMemo(() => {
    const goldSilver = holdings.filter(
      (h) => h.type === "gold" || h.type === "silver",
    )
    return goldSilver.map((h) => {
      const priceData = metalsPrices.find(
        (m) => m.metalType.toLowerCase() === h.type.toLowerCase(),
      )
      const sellPrice = priceData?.sellPriceSgd ?? h.currentPrice ?? 0
      const buyFromFeed = priceData?.buyPriceSgd ?? null
      const valuation =
        h.type === "gold"
          ? valuateGold(h.units, sellPrice, h.costBasis, buyFromFeed)
          : valuateSilver(h.units, sellPrice, h.costBasis, buyFromFeed)
      return {
        type: h.type as "gold" | "silver",
        unitsOz: h.units,
        buyPrice: valuation.buyPriceSgdPerOz,
        sellPrice: valuation.sellPriceSgdPerOz,
        currentValue: valuation.currentValueSgd,
        costBasis: valuation.totalCostBasisSgd,
        pnl: valuation.pnlSgd,
        pnlPct: valuation.pnlPct,
        lastUpdated: priceData
          ? new Date().toLocaleString("en-SG", {
              dateStyle: "short",
              timeStyle: "short",
            })
          : "—",
        dateAdded: h.createdAt
          ? new Date(h.createdAt).toLocaleString("en-SG", {
              dateStyle: "long",
            })
          : "—",
      }
    })
  }, [holdings, metalsPrices])

  const ilpCardsData = useMemo(() => {
    return ilpProducts.map((p: IlpProductWithEntries) => {
      const fundValue = p.latestEntry?.fund_value ?? 0
      const startDate = new Date(p.created_at)
      const now = new Date()
      const monthsPaid = Math.max(
        0,
        Math.floor(
          (now.getFullYear() - startDate.getFullYear()) * 12 +
            (now.getMonth() - startDate.getMonth()),
        ),
      )
      const estimatedPremiums =
        p.premium_payment_mode === "one_time"
          ? 0
          : p.monthly_premium * Math.max(1, monthsPaid)
      const entryPremiums = p.latestEntry?.premiums_paid
      const useEntryPremiums =
        entryPremiums != null && Number(entryPremiums) > 0
      const totalPremiumsPaid = useEntryPremiums
        ? Number(entryPremiums)
        : estimatedPremiums
      const premiumsSource = useEntryPremiums
        ? ("entry" as const)
        : ("estimated" as const)
      const returnPct =
        totalPremiumsPaid > 0
          ? ((fundValue - totalPremiumsPaid) / totalPremiumsPaid) * 100
          : 0
      const sortedEntries = [...(p.entries ?? [])].sort(
        (a, b) => a.month.localeCompare(b.month),
      )
      let monthlyData = sortedEntries.map((e) => ({
        month: ilpEntryMonthKey(e.month),
        value: Number(e.fund_value),
      }))
      if (monthlyData.length === 0 && fundValue > 0) {
        monthlyData = [{ month: currentMonthYm(), value: fundValue }]
      }
      const pm: "monthly" | "one_time" =
        p.premium_payment_mode === "one_time" ? "one_time" : "monthly"
      const gAmt = p.ilp_fund_groups?.group_premium_amount
      const fundValueForAllocationWeighted = fundValueForAllocation(
        p.latestEntry,
        p.entries ?? [],
      )
      return {
        productId: p.id,
        name: p.name,
        groupId: p.ilp_fund_groups?.id ?? null,
        groupName: p.ilp_fund_groups?.name ?? null,
        groupAllocationPct:
          p.group_allocation_pct != null ? Number(p.group_allocation_pct) : null,
        fundValue,
        fundValueForAllocation: fundValueForAllocationWeighted,
        totalPremiumsPaid,
        premiumsSource,
        returnPct,
        monthlyPremium: p.monthly_premium,
        premiumPaymentMode: pm,
        groupPremiumAmount:
          gAmt != null && Number.isFinite(Number(gAmt)) ? Number(gAmt) : null,
        endDate: p.end_date,
        latestEntryMonth: p.latestEntry?.month ?? null,
        latestEntryFundValue: p.latestEntry?.fund_value ?? 0,
        latestEntryPremiumsPaid: p.latestEntry?.premiums_paid ?? null,
        monthlyData,
        fundReportSnapshot: p.latestEntry?.fund_report_snapshot ?? null,
      }
    })
  }, [ilpProducts])

  const ilpGroupedSections = useMemo(() => {
    type Card = (typeof ilpCardsData)[number]
    const withGroup = ilpCardsData.filter((c) => c.groupId)
    const without = ilpCardsData.filter((c) => !c.groupId)
    const map = new Map<string, { title: string; cards: Card[] }>()
    for (const c of withGroup) {
      const key = c.groupId!
      const title = c.groupName ?? "Group"
      if (!map.has(key)) map.set(key, { title, cards: [] })
      map.get(key)!.cards.push(c)
    }
    const sections = [...map.entries()].map(([key, v]) => ({
      key,
      title: v.title,
      cards: v.cards,
    }))
    sections.sort((a, b) => a.title.localeCompare(b.title))
    if (without.length > 0) {
      sections.push({
        key: "_ungrouped",
        title: "Other ILPs",
        cards: without,
      })
    }
    return sections
  }, [ilpCardsData])

  const showIlpGrouped = useMemo(
    () => ilpCardsData.some((c) => c.groupId),
    [ilpCardsData],
  )

  const ilpUngroupedSection = useMemo(
    () => ilpGroupedSections.find((s) => s.key === "_ungrouped"),
    [ilpGroupedSections],
  )

  /** Bulk select on the ILP tab only applies to ungrouped fund cards when groups exist. */
  const selectableIlpProductIds = useMemo(() => {
    if (showIlpGrouped) {
      return ilpCardsData.filter((c) => !c.groupId).map((c) => c.productId)
    }
    return ilpCardsData.map((c) => c.productId)
  }, [ilpCardsData, showIlpGrouped])

  useEffect(() => {
    setIlpSelectedIds((prev) =>
      prev.filter((id) => selectableIlpProductIds.includes(id)),
    )
  }, [selectableIlpProductIds])

  const toggleIlpSelection = useCallback((productId: string) => {
    setIlpSelectedIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId],
    )
  }, [])

  const allIlpSelected =
    selectableIlpProductIds.length > 0 &&
    selectableIlpProductIds.every((id) => ilpSelectedIds.includes(id))
  const someIlpSelected =
    ilpSelectedIds.length > 0 && !allIlpSelected

  useEffect(() => {
    const el = ilpSelectAllRef.current
    if (el) el.indeterminate = someIlpSelected
  }, [someIlpSelected])

  const handleSelectAllIlp = useCallback(() => {
    if (allIlpSelected) {
      setIlpSelectedIds([])
    } else {
      setIlpSelectedIds([...selectableIlpProductIds])
    }
  }, [allIlpSelected, selectableIlpProductIds])

  const handleBulkDeleteIlp = useCallback(async () => {
    if (ilpSelectedIds.length === 0) return
    setIlpBulkDeleting(true)
    const ids = [...ilpSelectedIds]
    const nameById = new Map(
      ilpCardsData.map((c) => [c.productId, c.name] as const),
    )
    try {
      for (const id of ids) {
        const res = await fetch(`/api/investments/ilp/${id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(activeFamilyId && { familyId: activeFamilyId }),
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(
            typeof err.error === "string"
              ? err.error
              : `Failed to delete ${nameById.get(id) ?? id}`,
          )
        }
      }
      toast.success(
        `Removed ${ids.length} ILP product${ids.length === 1 ? "" : "s"}`,
      )
      setIlpSelectedIds([])
      setIlpBulkDeleteOpen(false)
      await fetchData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed")
    } finally {
      setIlpBulkDeleting(false)
    }
  }, [ilpSelectedIds, ilpCardsData, activeFamilyId, fetchData])

  if (!activeProfileId && !activeFamilyId) {
    return (
      <InvestmentsDisplayCurrencyProvider
        sgdPerUsd={sgdPerUsd}
        fxLoading={fxLoading}
      >
        <div className="space-y-6 p-4 sm:p-6">
          <SectionHeader
            title="Investments Detail"
            description="Full holdings, journals, and market breakdown."
          >
            <InvestmentsCurrencyToggle />
          </SectionHeader>
          <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
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
      <SectionHeader
        title="Investments Detail"
        description="Full holdings, journals, and market breakdown."
      >
        <InvestmentsCurrencyToggle />
      </SectionHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <InvestmentValueChart
          profileId={activeProfileId}
          familyId={activeFamilyId}
          className="min-h-0"
          breakdown={
            !isLoading
              ? {
                  holdingsLive: totalValue,
                  brokerageCash: cashBalance,
                  ilpTotal: ilpTotalSum,
                }
              : undefined
          }
        />
        <div className="rounded-xl border bg-card p-4">
          {isLoading ? (
            <ChartSkeleton height={336} className="rounded-lg" />
          ) : allocationByHolding.length === 0 ? (
            <div className="flex h-[336px] flex-col justify-center gap-1 px-2 text-center text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                Listed holdings &amp; cash
              </span>
              <span>
                No slices to chart. Add live-priced holdings, positive brokerage
                cash, or see ILP in the next card.
                {cashBalance < 0 ? (
                  <span className="mt-1 block text-xs">
                    Negative cash (e.g. GIRO) is included in portfolio total but
                    not shown in the donut.
                  </span>
                ) : null}
              </span>
            </div>
          ) : (
            <AllocationChart
              data={allocationByHolding}
              title="Listed holdings & cash"
              legendMaxItems={3}
              height={336}
            />
          )}
        </div>
        <div className="rounded-xl border bg-card p-4">
          {isLoading ? (
            <ChartSkeleton height={280} className="rounded-lg" />
          ) : ilpDonutSlices.length === 0 ? (
            <div className="flex h-[280px] flex-col justify-center gap-1 px-2 text-center text-sm text-muted-foreground">
              <span className="font-medium text-foreground">ILP</span>
              <span>
                No ILP fund value yet. Add a product and monthly entries in
                the ILP tab.
              </span>
            </div>
          ) : (
            <AllocationChart
              data={ilpDonutSlices}
              title="ILP"
              centerSubtitle="Each fund; group prefix when in a fund group"
              legendMaxItems={6}
              height={336}
            />
          )}
        </div>
      </div>

      <Tabs key={defaultTab} defaultValue={defaultTab}>
        <div className="-mx-1 min-w-0 overflow-x-auto no-scrollbar [overscroll-behavior-x:contain] [-webkit-overflow-scrolling:touch]">
          <TabsList className="inline-flex w-fit flex-nowrap">
            <TabsTrigger value="holdings">Holdings</TabsTrigger>
            <TabsTrigger value="allocation">Allocation</TabsTrigger>
            <TabsTrigger value="ilp">ILP</TabsTrigger>
            <TabsTrigger value="metals">Precious Metals</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="holdings" className="mt-4 space-y-4">
          <div className="flex flex-wrap justify-end gap-2">
            {activeProfileId || activeFamilyId ? (
              <Button
                type="button"
                onClick={() => setCashBalanceOpen(true)}
              >
                Cash balance
              </Button>
            ) : null}
            <Button type="button" onClick={() => setAddHoldingOpen(true)}>
              Add holding
            </Button>
          </div>
          {activeProfileId || activeFamilyId ? (
            <Sheet open={cashBalanceOpen} onOpenChange={setCashBalanceOpen}>
              <SheetContent
                side="right"
                className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg"
              >
                <SheetHeader className="border-b p-4 text-left">
                  <SheetTitle>Cash balance</SheetTitle>
                  <SheetDescription>
                    USD entry; we store the SGD equivalent for portfolio totals.
                  </SheetDescription>
                </SheetHeader>
                <div className="p-4">
                  <InvestmentAccountBalance
                    embedded
                    onSuccess={() => {
                      void fetchData()
                      setCashBalanceOpen(false)
                    }}
                    cashBalance={cashBalance}
                    accountId={accountRowId}
                    isLoading={isLoading}
                    parentFx={{ sgdPerUsd, fxLoading }}
                  />
                </div>
              </SheetContent>
            </Sheet>
          ) : null}
          <Sheet open={addHoldingOpen} onOpenChange={setAddHoldingOpen}>
            <SheetContent
              side="right"
              className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg"
            >
              <SheetHeader className="border-b p-4 text-left">
                <SheetTitle>Add holding</SheetTitle>
                <SheetDescription>
                  Symbol, units, cost basis, and optional note.
                </SheetDescription>
              </SheetHeader>
              <div className="p-4">
                <AddHoldingForm
                  onSuccess={() => {
                    void fetchData()
                    setAddHoldingOpen(false)
                  }}
                />
              </div>
            </SheetContent>
          </Sheet>
          {isLoading ? (
            <ChartSkeleton height={256} className="rounded-xl" />
          ) : holdingGroups.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
              No holdings found. Use{" "}
              <strong className="text-foreground">Add holding</strong> to add a
              position.
            </div>
          ) : (
            <>
              <HoldingsTable
                groups={holdingGroups}
                portfolioDenominator={fullPortfolioTotal}
                onChanged={fetchData}
                onRowClick={(g) => setHoldingDetail(g)}
              />
              <HoldingDetailSheet
                open={holdingDetail != null}
                onOpenChange={(open) => {
                  if (!open) setHoldingDetail(null)
                }}
                summary={holdingDetail?.summary ?? null}
                lots={holdingDetail?.lots ?? []}
                profileId={activeProfileId}
                familyId={activeFamilyId}
                onChanged={fetchData}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="allocation" className="mt-4">
          {isLoading ? (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border p-4">
                <ChartSkeleton height={320} />
              </div>
              <div className="rounded-xl border p-4">
                <ChartSkeleton height={320} />
              </div>
            </div>
          ) : allocationByType.length === 0 &&
            allocationByMarket.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
              No allocation data. Add holdings, cash, or ILP to see breakdown.
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border p-4">
                <AllocationChart data={allocationByType} title="By Type" />
              </div>
              <div className="rounded-xl border p-4">
                <AllocationChart data={allocationByMarket} title="By Market" />
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="ilp" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {selectableIlpProductIds.length > 0 ? (
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    ref={ilpSelectAllRef}
                    type="checkbox"
                    className="size-4 rounded border border-input accent-primary"
                    checked={allIlpSelected}
                    onChange={handleSelectAllIlp}
                    aria-label="Select all ILP funds"
                  />
                  <span>Select all</span>
                </label>
                <span className="text-sm text-muted-foreground">
                  {ilpSelectedIds.length} selected
                </span>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={ilpSelectedIds.length === 0}
                  onClick={() => setIlpBulkDeleteOpen(true)}
                >
                  Delete selected
                </Button>
              </div>
            ) : (
              <span />
            )}
            <Button type="button" onClick={() => setAddIlpOpen(true)}>
              Add ILP Product
            </Button>
          </div>
          <AlertDialog
            open={ilpBulkDeleteOpen}
            onOpenChange={(open) => {
              if (!ilpBulkDeleting) setIlpBulkDeleteOpen(open)
            }}
          >
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete selected ILP products?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-left">
                    <p>
                      The following{" "}
                      {ilpSelectedIds.length === 1 ? "product" : "products"} and
                      all monthly value history will be permanently removed:
                    </p>
                    <ul className="max-h-40 list-inside list-disc overflow-y-auto text-foreground">
                      {ilpSelectedIds.map((id) => {
                        const row = ilpCardsData.find((c) => c.productId === id)
                        return (
                          <li key={id} className="text-sm">
                            {row?.name ?? id}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={ilpBulkDeleting}>
                  Cancel
                </AlertDialogCancel>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={ilpBulkDeleting}
                  onClick={() => void handleBulkDeleteIlp()}
                >
                  {ilpBulkDeleting ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Deleting…
                    </>
                  ) : (
                    "Delete"
                  )}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Sheet open={addIlpOpen} onOpenChange={setAddIlpOpen}>
            <SheetContent
              side="right"
              className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg"
            >
              <SheetHeader className="border-b p-4 text-left">
                <SheetTitle>Add ILP Product</SheetTitle>
                <SheetDescription>
                  Enter policy details and optional initial snapshot values.
                </SheetDescription>
              </SheetHeader>
              <div className="p-4">
                <AddIlpForm
                  onSuccess={() => {
                    void fetchData()
                    setAddIlpOpen(false)
                  }}
                />
              </div>
            </SheetContent>
          </Sheet>
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <ChartSkeleton height={200} className="rounded-xl" />
              <ChartSkeleton height={200} className="rounded-xl" />
              <ChartSkeleton height={200} className="rounded-xl" />
            </div>
          ) : ilpCardsData.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
              No ILP products yet. Use{" "}
              <strong className="text-foreground">Add ILP Product</strong> to get
              started.
            </div>
          ) : showIlpGrouped ? (
            <div className="space-y-8">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {ilpGroupedSections
                  .filter((s) => s.key !== "_ungrouped")
                  .map((section) => (
                    <div key={section.key} className="min-w-0">
                      <IlpGroupSummaryCard
                        groupId={section.key}
                        title={section.title}
                        cards={section.cards}
                        fullPortfolioTotal={fullPortfolioTotal}
                        chartHeight={380}
                      />
                    </div>
                  ))}
              </div>
              {ilpUngroupedSection ? (
                <section className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {ilpUngroupedSection.title}
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {ilpUngroupedSection.cards.map((card) => (
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
                          monthlyData={card.monthlyData}
                          fundReportSnapshot={card.fundReportSnapshot}
                          groupAllocationPct={card.groupAllocationPct}
                          onAddEntry={fetchData}
                          onEditSuccess={fetchData}
                          selection={{
                            selected: ilpSelectedIds.includes(card.productId),
                            onToggle: () => toggleIlpSelection(card.productId),
                          }}
                        />
                      ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {ilpCardsData.map((card) => (
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
                  monthlyData={card.monthlyData}
                  fundReportSnapshot={card.fundReportSnapshot}
                  groupAllocationPct={card.groupAllocationPct}
                  onAddEntry={fetchData}
                  onEditSuccess={fetchData}
                  selection={{
                    selected: ilpSelectedIds.includes(card.productId),
                    onToggle: () => toggleIlpSelection(card.productId),
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="metals" className="mt-4 space-y-4">
          <div className="max-w-lg rounded-xl border p-4">
            <h3 className="mb-4 text-sm font-medium">Add Precious Metal</h3>
            <AddMetalForm onSuccess={fetchData} />
          </div>
          {isLoading ? (
            <ChartSkeleton height={192} className="max-w-lg rounded-xl" />
          ) : metalsHoldings.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
              No precious metals holdings. Add gold or silver above to get started.
            </div>
          ) : (
            <div className="max-w-lg">
              <PreciousMetals metals={metalsHoldings} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Buys and sells logged from this page (including optional notes) appear
            here. Use <strong>Holdings</strong> to add positions or{" "}
            <strong>Sell</strong> from the table to record a sale with a note.
          </p>
          {isLoading ? (
            <ChartSkeleton height={256} className="rounded-xl" />
          ) : journalEntries.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
              No trades recorded yet.
            </div>
          ) : (
            <JournalList entries={journalEntries} />
          )}
        </TabsContent>
      </Tabs>
      </div>
    </InvestmentsDisplayCurrencyProvider>
  )
}
