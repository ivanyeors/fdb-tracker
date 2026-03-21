"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { SectionHeader } from "@/components/dashboard/section-header"
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
import {
  currentMonthYm,
  ilpEntryMonthKey,
} from "@/lib/investments/ilp-chart"
import { valuateGold, valuateSilver } from "@/lib/calculations/precious-metals"
import {
  InvestmentsDisplayCurrencyProvider,
  InvestmentsCurrencyToggle,
} from "@/components/dashboard/investments/investments-display-currency"

type IlpProductWithEntries = {
  id: string
  name: string
  monthly_premium: number
  end_date: string
  created_at: string
  latestEntry: {
    fund_value: number
    month: string
    premiums_paid?: number | null
  } | null
  entries: { month: string; fund_value: number; premiums_paid?: number | null }[]
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

export default function InvestmentsDetailPage() {
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
            latestEntry: {
              fund_value: number
              month: string
              premiums_paid?: number | null
            } | null
            entries?: { month: string; fund_value: number; premiums_paid?: number | null }[]
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
    ilpProducts.forEach((p) => {
      const fundVal = p.latestEntry?.fund_value ?? 0
      if (fundVal > 0) {
        grouped.set("ILP", (grouped.get("ILP") || 0) + fundVal)
      }
    })
    const denom = fullPortfolioTotal > 0 ? fullPortfolioTotal : 1
    return Array.from(grouped.entries())
      .map(([name, value]) => ({
        name,
        value,
        percentage: (value / denom) * 100,
      }))
      .sort((a, b) => b.value - a.value)
  }, [holdings, ilpProducts, cashBalance, fullPortfolioTotal])

  /** One donut slice per ILP product (latest fund value). */
  const allocationByIlpProduct = useMemo(() => {
    const rows = ilpProducts
      .map((p) => ({
        name: p.name,
        value: p.latestEntry?.fund_value ?? 0,
      }))
      .filter((r) => r.value > 0)
    const ilpSum = rows.reduce((s, r) => s + r.value, 0)
    return rows
      .map((r) => ({
        name: r.name,
        value: r.value,
        percentage: ilpSum > 0 ? (r.value / ilpSum) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value)
  }, [ilpProducts])

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
      const estimatedPremiums = p.monthly_premium * Math.max(1, monthsPaid)
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
      return {
        productId: p.id,
        name: p.name,
        fundValue,
        totalPremiumsPaid,
        premiumsSource,
        returnPct,
        monthlyPremium: p.monthly_premium,
        endDate: p.end_date,
        latestEntryMonth: p.latestEntry?.month ?? null,
        latestEntryFundValue: p.latestEntry?.fund_value ?? 0,
        latestEntryPremiumsPaid: p.latestEntry?.premiums_paid ?? null,
        monthlyData,
      }
    })
  }, [ilpProducts])

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
          ) : allocationByIlpProduct.length === 0 ? (
            <div className="flex h-[280px] flex-col justify-center gap-1 px-2 text-center text-sm text-muted-foreground">
              <span className="font-medium text-foreground">ILP</span>
              <span>
                No ILP fund value yet. Add a product and monthly entries in
                the ILP tab.
              </span>
            </div>
          ) : (
            <AllocationChart data={allocationByIlpProduct} title="ILP" />
          )}
        </div>
      </div>

      <Tabs defaultValue="holdings">
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
          <InvestmentAccountBalance
            onSuccess={fetchData}
            cashBalance={cashBalance}
            accountId={accountRowId}
            isLoading={isLoading}
            parentFx={{ sgdPerUsd, fxLoading }}
          />
          <div className="rounded-xl border p-4">
            <h3 className="mb-4 text-sm font-medium">Add Holding</h3>
            <AddHoldingForm onSuccess={fetchData} />
          </div>
          {isLoading ? (
            <ChartSkeleton height={256} className="rounded-xl" />
          ) : holdingGroups.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
              No holdings found.
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
          <div className="rounded-xl border p-4">
            <h3 className="mb-4 text-sm font-medium">Add ILP Product</h3>
            <AddIlpForm onSuccess={fetchData} />
          </div>
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              <ChartSkeleton height={200} className="rounded-xl" />
              <ChartSkeleton height={200} className="rounded-xl" />
            </div>
          ) : ilpCardsData.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
              No ILP products yet. Add one above to get started.
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
                  endDate={card.endDate}
                  latestEntryMonth={card.latestEntryMonth}
                  latestEntryFundValue={card.latestEntryFundValue}
                  latestEntryPremiumsPaid={card.latestEntryPremiumsPaid}
                  monthlyData={card.monthlyData}
                  onAddEntry={fetchData}
                  onEditSuccess={fetchData}
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
