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
} from "@/components/dashboard/investments/holdings-table"
import { AllocationChart } from "@/components/dashboard/investments/allocation-chart"
import { IlpCard } from "@/components/dashboard/investments/ilp-card"
import { PreciousMetals } from "@/components/dashboard/investments/precious-metals"
import {
  JournalList,
  type JournalEntry,
} from "@/components/dashboard/investments/journal-list"
import { JournalForm } from "@/components/dashboard/investments/journal-form"
import { AddHoldingForm } from "@/components/dashboard/investments/add-holding-form"
import { InvestmentAccountBalance } from "@/components/dashboard/investments/investment-account-balance"
import { AddIlpForm } from "@/components/dashboard/investments/add-ilp-form"
import { AddMetalForm } from "@/components/dashboard/investments/add-metal-form"
import { Skeleton } from "@/components/ui/skeleton"
import { ChartSkeleton } from "@/components/loading"
import { useActiveProfile } from "@/hooks/use-active-profile"

type IlpProductWithEntries = {
  id: string
  name: string
  monthly_premium: number
  end_date: string
  created_at: string
  latestEntry: { fund_value: number; month: string } | null
  entries: { month: string; fund_value: number }[]
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
  const sgxTickers = ["DBS", "OCBC", "UOB", "SIA", "STI", "G3B", "ES3", "N2IU"]
  const upper = symbol.toUpperCase()
  if (sgxTickers.some((t) => upper.startsWith(t) || upper.includes(t)))
    return "SGX"
  return "US"
}

export default function InvestmentsDetailPage() {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [ilpProducts, setIlpProducts] = useState<IlpProductWithEntries[]>([])
  const [metalsPrices, setMetalsPrices] = useState<
    { metalType: string; buyPriceSgd: number; sellPriceSgd: number }[]
  >([])
  const [isLoading, setIsLoading] = useState(true)

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

      const [invRes, ilpRes, pricesRes] = await Promise.all([
        fetch(`/api/investments?${params}`),
        fetch(`/api/investments/ilp?${params}`),
        fetch("/api/prices?metals=true"),
      ])

      if (invRes.ok) {
        const json = await invRes.json()
        let totalPortfolioValue = 0
        const mapped: Holding[] = json.map(
          (inv: {
            symbol: string
            type: string
            units: number
            cost_basis: number
            marketValue?: number
            currentPrice?: number
            unrealisedPnL?: number
            unrealisedPnLPct?: number
            created_at: string
          }) => {
            const val = inv.marketValue ?? inv.units * inv.cost_basis
            totalPortfolioValue += val
            return {
              symbol: inv.symbol,
              type: inv.type,
              units: inv.units,
              costBasis: inv.cost_basis * inv.units,
              currentPrice: inv.currentPrice ?? inv.cost_basis,
              currentValue: val,
              pnl: inv.unrealisedPnL ?? 0,
              pnlPct: inv.unrealisedPnLPct ?? 0,
              portfolioPct: 0,
              createdAt: inv.created_at,
            }
          },
        )
        const finalHoldings = mapped.map((h) => ({
          ...h,
          portfolioPct:
            totalPortfolioValue > 0
              ? (h.currentValue / totalPortfolioValue) * 100
              : 0,
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
            latestEntry: { fund_value: number; month: string } | null
            entries?: { month: string; fund_value: number }[]
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
    } catch (error) {
      console.error("Failed to fetch investments detail:", error)
    } finally {
      setIsLoading(false)
    }
  }, [activeProfileId, activeFamilyId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const totalValue = useMemo(
    () => holdings.reduce((sum, h) => sum + h.currentValue, 0),
    [holdings],
  )

  const allocationByType = useMemo(() => {
    const grouped = new Map<string, number>()
    holdings.forEach((h) => {
      const label = mapToCategoryLabel(h.type)
      grouped.set(label, (grouped.get(label) || 0) + h.currentValue)
    })
    return Array.from(grouped.entries())
      .map(([name, value]) => ({
        name,
        value,
        percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value)
  }, [holdings, totalValue])

  const allocationByMarket = useMemo(() => {
    const grouped = new Map<string, number>()
    holdings.forEach((h) => {
      const label = mapToMarketLabel(h.symbol, h.type)
      grouped.set(label, (grouped.get(label) || 0) + h.currentValue)
    })
    ilpProducts.forEach((p) => {
      const fundVal = p.latestEntry?.fund_value ?? 0
      if (fundVal > 0) {
        grouped.set("ILP", (grouped.get("ILP") || 0) + fundVal)
      }
    })
    const ilpTotal = grouped.get("ILP") ?? 0
    const totalWithIlp = totalValue + ilpTotal
    return Array.from(grouped.entries())
      .map(([name, value]) => ({
        name,
        value,
        percentage:
          totalWithIlp > 0 ? (value / totalWithIlp) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value)
  }, [holdings, ilpProducts, totalValue])

  const metalsHoldings = useMemo(() => {
    const goldSilver = holdings.filter(
      (h) => h.type === "gold" || h.type === "silver",
    )
    return goldSilver.map((h) => {
      const priceData = metalsPrices.find(
        (m) => m.metalType.toLowerCase() === h.type.toLowerCase(),
      )
      const sellPrice = priceData?.sellPriceSgd ?? h.currentPrice
      const buyPrice = priceData?.buyPriceSgd ?? sellPrice
      const currentValue = h.units * sellPrice
      const costBasis = h.costBasis
      const pnl = currentValue - costBasis
      const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0
      return {
        type: h.type as "gold" | "silver",
        unitsOz: h.units,
        buyPrice,
        sellPrice,
        currentValue,
        costBasis,
        pnl,
        pnlPct,
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
      const totalPremiumsPaid = p.monthly_premium * Math.max(1, monthsPaid)
      const returnPct =
        totalPremiumsPaid > 0
          ? ((fundValue - totalPremiumsPaid) / totalPremiumsPaid) * 100
          : 0
      const sortedEntries = [...(p.entries ?? [])].sort(
        (a, b) => a.month.localeCompare(b.month),
      )
      let monthlyData = sortedEntries.map((e) => ({
        month: new Date(e.month + "-01").toLocaleString("en-US", {
          month: "short",
        }),
        value: e.fund_value,
      }))
      if (monthlyData.length === 0 && fundValue > 0) {
        monthlyData = [
          {
            month: new Date().toLocaleString("en-US", { month: "short" }),
            value: fundValue,
          },
        ]
      }
      return {
        productId: p.id,
        name: p.name,
        fundValue,
        totalPremiumsPaid,
        returnPct,
        monthlyPremium: p.monthly_premium,
        endDate: p.end_date,
        monthlyData,
      }
    })
  }, [ilpProducts])

  if (!activeProfileId && !activeFamilyId) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <SectionHeader
          title="Investments Detail"
          description="Full holdings, journals, and market breakdown."
        />
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
          Please select a profile first.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Investments Detail"
        description="Full holdings, journals, and market breakdown."
      />

      <Tabs defaultValue="holdings">
        <div className="-mx-1 min-w-0 overflow-x-auto no-scrollbar [overscroll-behavior-x:contain] [-webkit-overflow-scrolling:touch]">
          <TabsList className="inline-flex w-fit flex-nowrap">
            <TabsTrigger value="holdings">Holdings</TabsTrigger>
            <TabsTrigger value="allocation">Allocation</TabsTrigger>
            <TabsTrigger value="ilp">ILP</TabsTrigger>
            <TabsTrigger value="metals">Precious Metals</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="holdings" className="mt-4 space-y-4">
          <InvestmentAccountBalance onSuccess={fetchData} />
          <div className="rounded-xl border p-4">
            <h3 className="mb-4 text-sm font-medium">Add Holding</h3>
            <AddHoldingForm onSuccess={fetchData} />
          </div>
          {isLoading ? (
            <ChartSkeleton height={256} className="rounded-xl" />
          ) : holdings.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
              No holdings found.
            </div>
          ) : (
            <HoldingsTable holdings={holdings} />
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
          ) : allocationByType.length === 0 && allocationByMarket.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
              No allocation data. Add holdings to see breakdown.
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
                  returnPct={card.returnPct}
                  monthlyPremium={card.monthlyPremium}
                  endDate={card.endDate}
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
      </Tabs>
    </div>
  )
}
