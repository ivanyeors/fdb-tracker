"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import { SectionHeader } from "@/components/dashboard/section-header"
import { SeasonalityPrompts } from "@/components/dashboard/investments/seasonality-prompts"
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
import { IlpCard } from "@/components/dashboard/investments/ilp-card"
import { IlpGroupSummaryCard } from "@/components/dashboard/investments/ilp-group-summary-card"
import { AddHoldingForm } from "@/components/dashboard/investments/add-holding-form"
import { InvestmentAccountBalance } from "@/components/dashboard/investments/investment-account-balance"
import { AddIlpSheetContent } from "@/components/dashboard/investments/add-ilp-sheet-content"
import { ChartSkeleton } from "@/components/loading"
import {
  JournalList,
  type JournalEntry,
} from "@/components/dashboard/investments/journal-list"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { useDataRefresh } from "@/hooks/use-data-refresh"
import { useApi } from "@/hooks/use-api"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  currentMonthYm,
  ilpEntryMonthKey,
} from "@/lib/investments/ilp-chart"
import { calculateRebalancing } from "@/lib/calculations/rebalancing"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { allocationByIlpGroupOrStandalone } from "@/lib/investments/ilp-allocation-aggregate"
import { fundValueForAllocation } from "@/lib/investments/ilp-fund-value-for-allocation"
import {
  InvestmentsDisplayCurrencyProvider,
  InvestmentsCurrencyToggle,
} from "@/components/dashboard/investments/investments-display-currency"
import { AllocationTab } from "@/components/dashboard/investments/allocation-tab"
import {
  CardsTab,
  type CollectibleCard,
} from "@/components/dashboard/investments/cards-tab"
import {
  OthersTab,
  type CollectibleOther,
} from "@/components/dashboard/investments/others-tab"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Plus, CreditCard, Package } from "lucide-react"

const AllocationChart = dynamic(
  () =>
    import("@/components/dashboard/investments/allocation-chart").then(
      (m) => m.AllocationChart
    ),
  { ssr: false, loading: () => <ChartSkeleton className="h-[300px]" /> }
)

const InvestmentValueChart = dynamic(
  () =>
    import("@/components/dashboard/investments/investment-value-chart").then(
      (m) => m.InvestmentValueChart
    ),
  { ssr: false, loading: () => <ChartSkeleton className="h-[300px]" /> }
)

type IlpFundGroupMembership = {
  id: string
  group_id: string
  group_name: string
  allocation_pct: number
  group_premium_amount?: number | null
  premium_payment_mode?: string | null
}

type IlpProductWithEntries = {
  id: string
  name: string
  profile_id?: string | null
  monthly_premium: number
  premium_payment_mode?: string | null
  end_date: string
  created_at: string
  fund_group_memberships?: IlpFundGroupMembership[]
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

type InvestmentRaw = {
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
  target_allocation_pct?: number | null
  created_at: string
}

type InvestmentsPayload =
  | InvestmentRaw[]
  | { investments: InvestmentRaw[]; sgdPerUsd: number | null }

type AccountPayload = {
  id: string | null
  cashBalance: number
}

type TransactionRow = {
  id: string
  symbol: string
  type: string
  quantity: number
  price: number
  journal_text?: string | null
  screenshot_url?: string | null
  created_at: string
}

type FxPayload = {
  sgdPerUsd: number | null
}

export type InvestmentsInitialData = {
  investments: InvestmentsPayload | null
  ilp: IlpProductWithEntries[] | null
  account: AccountPayload | null
  transactions: TransactionRow[] | null
  fx: FxPayload | null
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

/** One donut slice per ticker / metal type (merged if duplicate symbols). */
function holdingDonutLabel(symbol: string, type: string): string {
  if (type === "gold" || type === "silver") return mapToCategoryLabel(type)
  const s = symbol.trim()
  if (s.length > 0) return s.toUpperCase()
  return mapToCategoryLabel(type)
}

const BASE_TAB_SET = new Set(["holdings", "allocation", "ilp", "activity"])

type InvestmentTab = {
  id: string
  family_id: string
  tab_type: "cards" | "others"
  tab_label: string
  sort_order: number
  is_visible: boolean
  created_at: string
}

function buildUrl(
  base: string,
  profileId: string | null,
  familyId: string | null,
  extra?: Record<string, string>
): string | null {
  if (!profileId && !familyId) return null
  const url = new URL(base, "http://localhost")
  if (profileId) url.searchParams.set("profileId", profileId)
  else if (familyId) url.searchParams.set("familyId", familyId)
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      url.searchParams.set(k, v)
    }
  }
  return `${url.pathname}${url.search}`
}

function processInvestmentsPayload(payload: InvestmentsPayload | null) {
  if (!payload) return { holdings: [], sgdPerUsd: null, rebalanceSuggestions: [] }

  const list = Array.isArray(payload) ? payload : payload.investments
  const rateFromInv = Array.isArray(payload) ? null : payload.sgdPerUsd
  const rate = rateFromInv != null && rateFromInv > 0 ? rateFromInv : null

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
    const currentValueSgd = hasLive && mv != null && rate ? mv * rate : null
    const pnlSgd =
      hasLive && inv.unrealisedPnL != null && rate
        ? inv.unrealisedPnL * rate
        : null
    const currentPriceSgd = cp != null && rate ? cp * rate : null
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
        hasLive && inv.unrealisedPnLPct != null ? inv.unrealisedPnLPct : null,
      portfolioPct: 0,
      createdAt: inv.created_at,
    }
  })

  const finalHoldings = mapped.map((h) => ({
    ...h,
    portfolioPct: 0,
  }))

  const rebalanceEntries = list.map((inv) => {
    const r = rate ?? 1
    const mv = inv.marketValue
    const hasLive =
      inv.pricingSource === "live" &&
      mv != null &&
      Number.isFinite(mv) &&
      mv > 0
    const currentValue =
      hasLive && mv != null ? mv * r : inv.cost_basis * inv.units
    return {
      id: inv.id,
      symbol: inv.symbol,
      currentValue,
      targetPct: inv.target_allocation_pct ?? null,
    }
  })

  return {
    holdings: finalHoldings,
    sgdPerUsd: rateFromInv,
    rebalanceSuggestions: calculateRebalancing(rebalanceEntries),
  }
}

function processIlpPayload(
  products: IlpProductWithEntries[] | null
): IlpProductWithEntries[] {
  if (!products) return []
  return products.map((p) => ({ ...p, entries: p.entries ?? [] }))
}

function processTransactionsPayload(
  rows: TransactionRow[] | null
): JournalEntry[] {
  if (!rows) return []
  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    type: r.type as "buy" | "sell",
    quantity: r.quantity,
    price: r.price,
    journalText: r.journal_text ?? undefined,
    screenshotUrl: r.screenshot_url ?? undefined,
    date: r.created_at,
  }))
}

export function InvestmentsClient({
  initialData,
}: {
  initialData: InvestmentsInitialData
}) {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")

  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const { triggerRefresh } = useDataRefresh()

  // --- SWR-powered data fetching with server-prefetched fallback ---

  const invPath = buildUrl("/api/investments", activeProfileId, activeFamilyId)
  const ilpPath = buildUrl(
    "/api/investments/ilp",
    activeProfileId,
    activeFamilyId
  )
  const accountPath = buildUrl(
    "/api/investments/account",
    activeProfileId,
    activeFamilyId
  )
  const txPath = buildUrl(
    "/api/investments/transactions",
    activeProfileId,
    activeFamilyId,
    { limit: "100" }
  )

  const { data: invRaw, isLoading: invLoading } =
    useApi<InvestmentsPayload>(invPath, {
      fallbackData: initialData.investments ?? undefined,
    })
  const { data: ilpRaw, isLoading: ilpLoading } = useApi<
    IlpProductWithEntries[]
  >(ilpPath, {
    fallbackData: initialData.ilp ?? undefined,
  })
  const { data: accountRaw, isLoading: accountLoading } =
    useApi<AccountPayload>(accountPath, {
      fallbackData: initialData.account ?? undefined,
    })
  const { data: txRaw, isLoading: txLoading } = useApi<TransactionRow[]>(
    txPath,
    {
      fallbackData: initialData.transactions ?? undefined,
    }
  )
  const { data: fxRaw, isLoading: fxLoading } = useApi<FxPayload>(
    "/api/fx/usd-sgd",
    {
      fallbackData: initialData.fx ?? undefined,
    }
  )

  // --- Dynamic collectible tabs ---
  const tabsPath = activeFamilyId
    ? `/api/investments/tabs?familyId=${activeFamilyId}`
    : null
  const { data: dynamicTabs, isLoading: tabsLoading } =
    useApi<InvestmentTab[]>(tabsPath)

  const investmentTabs = useMemo(() => dynamicTabs ?? [], [dynamicTabs])

  // Resolve the default tab (base tabs + dynamic tab IDs are valid)
  const allTabIds = useMemo(() => {
    const set = new Set(BASE_TAB_SET)
    for (const t of investmentTabs) set.add(`tab-${t.id}`)
    return set
  }, [investmentTabs])

  const defaultTab =
    tabParam && allTabIds.has(tabParam) ? tabParam : "holdings"

  // Fetch collectible data for each active tab
  const cardsTab = investmentTabs.find((t) => t.tab_type === "cards")
  const othersTab = investmentTabs.find((t) => t.tab_type === "others")

  const cardsPath = cardsTab
    ? buildUrl("/api/investments/cards", activeProfileId, activeFamilyId, {
        tabId: cardsTab.id,
      })
    : null
  const othersPath = othersTab
    ? buildUrl("/api/investments/others", activeProfileId, activeFamilyId, {
        tabId: othersTab.id,
      })
    : null

  const { data: cardsData, isLoading: cardsLoading } =
    useApi<CollectibleCard[]>(cardsPath)
  const { data: othersData, isLoading: othersLoading } =
    useApi<CollectibleOther[]>(othersPath)

  const collectibleCards = useMemo(() => cardsData ?? [], [cardsData])
  const collectibleOthers = useMemo(() => othersData ?? [], [othersData])

  const [addTabOpen, setAddTabOpen] = useState(false)
  const [addingTab, setAddingTab] = useState(false)

  const handleAddTab = useCallback(
    async (tabType: "cards" | "others") => {
      if (!activeFamilyId) return
      setAddingTab(true)
      try {
        const res = await fetch("/api/investments/tabs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ familyId: activeFamilyId, tabType }),
        })
        if (!res.ok) throw new Error("Failed to create tab")
        toast.success(
          `Added ${tabType === "cards" ? "Cards" : "Others"} tab`,
        )
        setAddTabOpen(false)
        triggerRefresh()
      } catch {
        toast.error("Failed to add tab")
      } finally {
        setAddingTab(false)
      }
    },
    [activeFamilyId, triggerRefresh],
  )

  const isLoading = invLoading || ilpLoading || accountLoading || txLoading

  // --- Derived state ---

  const { holdings, sgdPerUsd: rateFromInv, rebalanceSuggestions } = useMemo(
    () => processInvestmentsPayload(invRaw ?? null),
    [invRaw]
  )

  const sgdPerUsd = useMemo(() => {
    if (rateFromInv != null && rateFromInv > 0) return rateFromInv
    return fxRaw?.sgdPerUsd ?? null
  }, [rateFromInv, fxRaw])

  const ilpProducts = useMemo(() => processIlpPayload(ilpRaw ?? null), [ilpRaw])

  const cashBalance = accountRaw?.cashBalance ?? 0
  const accountRowId = accountRaw?.id ?? null

  const journalEntries = useMemo(
    () => processTransactionsPayload(txRaw ?? null),
    [txRaw]
  )

  // --- UI state ---

  const [holdingDetail, setHoldingDetail] = useState<HoldingGroup | null>(null)
  const [addIlpOpen, setAddIlpOpen] = useState(false)
  const [cashBalanceOpen, setCashBalanceOpen] = useState(false)
  const [addHoldingOpen, setAddHoldingOpen] = useState(false)
  const [ilpSelectedIds, setIlpSelectedIds] = useState<string[]>([])
  const [ilpBulkDeleteOpen, setIlpBulkDeleteOpen] = useState(false)
  const [ilpBulkDeleting, setIlpBulkDeleting] = useState(false)
  const ilpSelectAllRef = useRef<HTMLInputElement>(null)

  const handleMutation = useCallback(() => {
    triggerRefresh()
  }, [triggerRefresh])

  /** Live market values are USD; convert to SGD for totals with cash / ILP. */
  const totalValue = useMemo(
    () => holdings.reduce((sum, h) => sum + (h.currentValue ?? 0), 0),
    [holdings]
  )

  const ilpTotalSum = useMemo(
    () =>
      ilpProducts.reduce((s, p) => s + (p.latestEntry?.fund_value ?? 0), 0),
    [ilpProducts]
  )

  const collectiblesTotal = useMemo(() => {
    const cardsTotal = collectibleCards.reduce(
      (s, i) => s + (i.current_value ?? i.purchase_price) * i.quantity,
      0,
    )
    const othersTotal = collectibleOthers.reduce(
      (s, i) => s + (i.current_value ?? i.purchase_price) * i.quantity,
      0,
    )
    return cardsTotal + othersTotal
  }, [collectibleCards, collectibleOthers])

  /** Matches computeTotalInvestmentsValue: cash + live holdings + ILP + collectibles. */
  const fullPortfolioTotal = useMemo(
    () => cashBalance + totalValue + ilpTotalSum + collectiblesTotal,
    [cashBalance, totalValue, ilpTotalSum, collectiblesTotal],
  )

  const holdingGroups = useMemo(() => groupHoldings(holdings), [holdings])

  /** Hero donut: listed holdings + positive brokerage cash (pie cannot slice negatives). */
  const allocationByHolding = useMemo(() => {
    const grouped = new Map<string, number>()
    holdings.forEach((h) => {
      const label = holdingDonutLabel(h.symbol, h.type)
      grouped.set(
        label,
        (grouped.get(label) || 0) + (h.currentValue ?? 0)
      )
    })
    if (cashBalance > 0) {
      grouped.set(
        "Cash balance",
        (grouped.get("Cash balance") || 0) + cashBalance
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

  /** ILP donut: one slice per fund group (aggregated) or standalone product. */
  const ilpDonutSlices = useMemo(
    () =>
      allocationByIlpGroupOrStandalone(
        ilpProducts.map((p) => ({
          name: p.name,
          latestEntry: p.latestEntry,
          fund_group_memberships: (p.fund_group_memberships ?? []).map((m) => ({
            group_id: m.group_id,
            group_name: m.group_name,
          })),
        }))
      ),
    [ilpProducts]
  )

  const ilpCardsData = useMemo(() => {
    return ilpProducts.map((p: IlpProductWithEntries) => {
      const fundValue = p.latestEntry?.fund_value ?? 0
      const startDate = new Date(p.created_at)
      const now = new Date()
      const monthsPaid = Math.max(
        0,
        Math.floor(
          (now.getFullYear() - startDate.getFullYear()) * 12 +
            (now.getMonth() - startDate.getMonth())
        )
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
      const sortedEntries = [...(p.entries ?? [])].sort((a, b) =>
        a.month.localeCompare(b.month)
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
      const memberships = p.fund_group_memberships ?? []
      const firstMembership = memberships[0]
      const gAmt = firstMembership?.group_premium_amount
      const fundValueForAllocationWeighted = fundValueForAllocation(
        p.latestEntry,
        p.entries ?? []
      )
      return {
        productId: p.id,
        name: p.name,
        profileId: p.profile_id ?? null,
        groupId: firstMembership?.group_id ?? null,
        groupName: firstMembership?.group_name ?? null,
        groupAllocationPct:
          firstMembership?.allocation_pct != null
            ? Number(firstMembership.allocation_pct)
            : null,
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
        fundGroupMemberships: memberships,
      }
    })
  }, [ilpProducts])

  const ilpGroupedSections = useMemo(() => {
    type IlpCardData = (typeof ilpCardsData)[number]
    const map = new Map<string, { title: string; cards: IlpCardData[] }>()
    const ungrouped: IlpCardData[] = []

    for (const c of ilpCardsData) {
      const memberships = (
        c as { fundGroupMemberships?: IlpFundGroupMembership[] }
      ).fundGroupMemberships ?? []
      if (memberships.length === 0) {
        ungrouped.push(c)
      } else {
        for (const m of memberships) {
          const key = m.group_id
          const title = m.group_name || "Group"
          if (!map.has(key)) map.set(key, { title, cards: [] })
          map.get(key)!.cards.push({
            ...c,
            groupId: m.group_id,
            groupName: m.group_name,
            groupAllocationPct: Number(m.allocation_pct),
            groupPremiumAmount:
              m.group_premium_amount != null
                ? Number(m.group_premium_amount)
                : null,
          })
        }
      }
    }

    const sections = [...map.entries()].map(([key, v]) => ({
      key,
      title: v.title,
      cards: v.cards,
    }))
    sections.sort((a, b) => a.title.localeCompare(b.title))
    if (ungrouped.length > 0) {
      sections.push({
        key: "_ungrouped",
        title: "Other ILPs",
        cards: ungrouped,
      })
    }
    return sections
  }, [ilpCardsData])

  const showIlpGrouped = useMemo(
    () => ilpCardsData.some((c) => c.groupId),
    [ilpCardsData]
  )

  const ilpUngroupedSection = useMemo(
    () => ilpGroupedSections.find((s) => s.key === "_ungrouped"),
    [ilpGroupedSections]
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
      prev.filter((id) => selectableIlpProductIds.includes(id))
    )
  }, [selectableIlpProductIds])

  const toggleIlpSelection = useCallback((productId: string) => {
    setIlpSelectedIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    )
  }, [])

  const allIlpSelected =
    selectableIlpProductIds.length > 0 &&
    selectableIlpProductIds.every((id) => ilpSelectedIds.includes(id))
  const someIlpSelected = ilpSelectedIds.length > 0 && !allIlpSelected

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
      ilpCardsData.map((c) => [c.productId, c.name] as const)
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
              : `Failed to delete ${nameById.get(id) ?? id}`
          )
        }
      }
      toast.success(
        `Removed ${ids.length} ILP product${ids.length === 1 ? "" : "s"}`
      )
      setIlpSelectedIds([])
      setIlpBulkDeleteOpen(false)
      triggerRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed")
    } finally {
      setIlpBulkDeleting(false)
    }
  }, [ilpSelectedIds, ilpCardsData, activeFamilyId, triggerRefresh])

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
            liveTotal={!isLoading ? fullPortfolioTotal : undefined}
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
                  No slices to chart. Add live-priced holdings, positive
                  brokerage cash, or see ILP in the next card.
                  {cashBalance < 0 ? (
                    <span className="mt-1 block text-xs">
                      Negative cash (e.g. GIRO) is included in portfolio total
                      but not shown in the donut.
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
                legendMaxItems={6}
                height={336}
              />
            )}
          </div>
        </div>

        <SeasonalityPrompts variant="full" />

        {rebalanceSuggestions.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Rebalancing Alerts</CardTitle>
                <Badge variant="outline" className="text-xs">
                  {rebalanceSuggestions.length} drift
                  {rebalanceSuggestions.length !== 1 ? "s" : ""}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {rebalanceSuggestions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.symbol}</span>
                      <span className="text-muted-foreground">
                        {s.currentPct.toFixed(1)}% → {s.targetPct.toFixed(1)}%
                      </span>
                      <Badge
                        variant={
                          s.action === "buy" ? "default" : "destructive"
                        }
                        className="text-xs"
                      >
                        {s.action === "buy" ? "Buy" : "Sell"} $
                        {formatCurrency(Math.abs(s.adjustmentAmount))}
                      </Badge>
                    </div>
                    <span
                      className={
                        s.driftPct > 0
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-blue-600 dark:text-blue-400"
                      }
                    >
                      {s.driftPct > 0 ? "+" : ""}
                      {s.driftPct.toFixed(1)}% drift
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Set target allocation per holding in Settings → User Settings →
                Investments. Alerts show when drift exceeds 5%.
              </p>
            </CardContent>
          </Card>
        )}

        <Tabs key={`${defaultTab}-${investmentTabs.length}`} defaultValue={defaultTab}>
          <div className="-mx-1 min-w-0 overflow-x-auto no-scrollbar [overscroll-behavior-x:contain] [-webkit-overflow-scrolling:touch]">
            <TabsList className="inline-flex w-fit flex-nowrap">
              <TabsTrigger value="holdings">Holdings</TabsTrigger>
              <TabsTrigger value="allocation">Allocation</TabsTrigger>
              {investmentTabs.map((tab) => (
                <TabsTrigger key={tab.id} value={`tab-${tab.id}`}>
                  {tab.tab_label}
                </TabsTrigger>
              ))}
              <TabsTrigger value="ilp">ILP</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            {activeFamilyId && (
              <Popover open={addTabOpen} onOpenChange={setAddTabOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="Add investment tab"
                  >
                    <Plus className="size-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1" align="start">
                  <button
                    type="button"
                    disabled={addingTab || !!cardsTab}
                    onClick={() => void handleAddTab("cards")}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                  >
                    <CreditCard className="size-4" />
                    Cards
                    {cardsTab && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        Added
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={addingTab || !!othersTab}
                    onClick={() => void handleAddTab("others")}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                  >
                    <Package className="size-4" />
                    Others
                    {othersTab && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        Added
                      </span>
                    )}
                  </button>
                </PopoverContent>
              </Popover>
            )}
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
                      USD entry; we store the SGD equivalent for portfolio
                      totals.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="p-4">
                    <InvestmentAccountBalance
                      embedded
                      onSuccess={() => {
                        handleMutation()
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
                      handleMutation()
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
                <strong className="text-foreground">Add holding</strong> to add
                a position.
              </div>
            ) : (
              <>
                <HoldingsTable
                  groups={holdingGroups}
                  portfolioDenominator={fullPortfolioTotal}
                  onChanged={handleMutation}
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
                  onChanged={handleMutation}
                />
              </>
            )}
          </TabsContent>

          <TabsContent value="allocation" className="mt-4">
            <AllocationTab
              holdings={holdings}
              ilpProducts={ilpProducts}
              cashBalance={cashBalance}
              ilpTotalSum={ilpTotalSum}
              fullPortfolioTotal={fullPortfolioTotal}
              isLoading={isLoading}
            />
          </TabsContent>

          {cardsTab && (
            <TabsContent value={`tab-${cardsTab.id}`} className="mt-4">
              <CardsTab
                tabId={cardsTab.id}
                items={collectibleCards}
                isLoading={cardsLoading}
                profileId={activeProfileId}
                familyId={activeFamilyId}
                onMutation={handleMutation}
              />
            </TabsContent>
          )}

          {othersTab && (
            <TabsContent value={`tab-${othersTab.id}`} className="mt-4">
              <OthersTab
                tabId={othersTab.id}
                items={collectibleOthers}
                isLoading={othersLoading}
                profileId={activeProfileId}
                familyId={activeFamilyId}
                onMutation={handleMutation}
              />
            </TabsContent>
          )}

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
                  <AlertDialogTitle>
                    Delete selected ILP products?
                  </AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2 text-left">
                      <p>
                        The following{" "}
                        {ilpSelectedIds.length === 1
                          ? "product"
                          : "products"}{" "}
                        and all monthly value history will be permanently
                        removed:
                      </p>
                      <ul className="max-h-40 list-inside list-disc overflow-y-auto text-foreground">
                        {ilpSelectedIds.map((id) => {
                          const row = ilpCardsData.find(
                            (c) => c.productId === id
                          )
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
                className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-2xl"
              >
                <AddIlpSheetContent
                  onSuccess={() => {
                    handleMutation()
                    setAddIlpOpen(false)
                  }}
                />
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
                <strong className="text-foreground">Add ILP Product</strong> to
                get started.
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
                          onDeleted={triggerRefresh}
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
                          profileId={card.profileId}
                          monthlyData={card.monthlyData}
                          fundReportSnapshot={card.fundReportSnapshot}
                          groupAllocationPct={card.groupAllocationPct}
                          onAddEntry={handleMutation}
                          onEditSuccess={handleMutation}
                          selection={{
                            selected: ilpSelectedIds.includes(card.productId),
                            onToggle: () =>
                              toggleIlpSelection(card.productId),
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
                    profileId={card.profileId}
                    monthlyData={card.monthlyData}
                    fundReportSnapshot={card.fundReportSnapshot}
                    groupAllocationPct={card.groupAllocationPct}
                    onAddEntry={handleMutation}
                    onEditSuccess={handleMutation}
                    selection={{
                      selected: ilpSelectedIds.includes(card.productId),
                      onToggle: () => toggleIlpSelection(card.productId),
                    }}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="activity" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Buys and sells logged from this page (including optional notes)
              appear here. Use <strong>Holdings</strong> to add positions or{" "}
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
