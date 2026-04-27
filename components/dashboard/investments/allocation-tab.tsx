"use client"

import { useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { AllocationChart } from "@/components/dashboard/investments/allocation-chart"
import { AllocationInsights } from "@/components/dashboard/investments/allocation-insights"
import { ConcentrationTable } from "@/components/dashboard/investments/concentration-table"
import { PortfolioLookThrough } from "@/components/dashboard/investments/portfolio-look-through"
import { ChartSkeleton } from "@/components/loading"
import { cn } from "@/lib/utils"
import {
  allocationByCurrency,
  hasIlpLookThroughData,
  type IlpProductForAllocation,
} from "@/lib/investments/allocation-views"
import { allocationByIlpGroupOrStandalone } from "@/lib/investments/ilp-allocation-aggregate"
import type { Holding } from "@/lib/investments/holding"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AllocationTabProps {
  readonly holdings: readonly Holding[]
  readonly ilpProducts: readonly IlpProductForAllocation[]
  readonly cashBalance: number
  readonly ilpTotalSum: number
  readonly fullPortfolioTotal: number
  readonly isLoading: boolean
}

// ---------------------------------------------------------------------------
// Collapsible section wrapper
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  readonly title: string
  readonly defaultOpen?: boolean
  readonly children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ChevronDown
          className={cn(
            "size-4 shrink-0 transition-transform duration-200",
            !open && "-rotate-90",
          )}
        />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
    </Collapsible>
  )
}

// ---------------------------------------------------------------------------
// Helpers (moved from page.tsx)
// ---------------------------------------------------------------------------

const ALLOCATION_CATEGORY_LABELS: Record<string, string> = {
  stock: "Stocks",
  etf: "ETF",
  gold: "Gold",
  silver: "Silver",
  ilp: "ILP",
  bond: "Bonds",
}

function mapToCategoryLabel(type: string): string {
  return (
    ALLOCATION_CATEGORY_LABELS[type] ??
    type.charAt(0).toUpperCase() + type.slice(1)
  )
}

function mapToMarketLabel(symbol: string, type: string): string {
  if (type === "gold" || type === "silver") return "Precious Metals"
  if (type === "ilp") return "ILP"
  const s = symbol.trim().toUpperCase()
  if (s.endsWith(".SI") || s.endsWith(".SG")) return "SGX"
  return "US"
}

function holdingDonutLabel(symbol: string, type: string): string {
  if (type === "gold" || type === "silver") return mapToCategoryLabel(type)
  const s = symbol.trim()
  if (s.length > 0) return s.toUpperCase()
  return mapToCategoryLabel(type)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AllocationTab({
  holdings,
  ilpProducts,
  cashBalance,
  ilpTotalSum,
  fullPortfolioTotal,
  isLoading,
}: AllocationTabProps) {
  // By Asset Class (was "By Type")
  const allocationByType = useMemo(() => {
    const grouped = new Map<string, number>()
    holdings.forEach((h) => {
      const label = mapToCategoryLabel(h.type)
      grouped.set(label, (grouped.get(label) || 0) + (h.currentValue ?? 0))
    })
    if (ilpTotalSum > 0) {
      grouped.set("ILP", (grouped.get("ILP") || 0) + ilpTotalSum)
    }
    if (cashBalance > 0) {
      grouped.set(
        "Cash",
        (grouped.get("Cash") || 0) + cashBalance,
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
  }, [holdings, cashBalance, ilpTotalSum, fullPortfolioTotal])

  // By Market
  const allocationByMarket = useMemo(() => {
    const grouped = new Map<string, number>()
    holdings.forEach((h) => {
      const label = mapToMarketLabel(h.symbol, h.type)
      grouped.set(label, (grouped.get(label) || 0) + (h.currentValue ?? 0))
    })
    if (cashBalance > 0) {
      grouped.set(
        "Cash",
        (grouped.get("Cash") || 0) + cashBalance,
      )
    }
    const ilpMarketSlices = allocationByIlpGroupOrStandalone(
      ilpProducts.map((p) => ({
        name: p.name,
        latestEntry: p.latestEntry,
        fund_group_memberships: (p.fund_group_memberships ?? []).map((m) => ({
          group_id: m.group_id,
          group_name: m.group_name,
        })),
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

  // By Currency
  const allocationByCurrencyData = useMemo(
    () =>
      allocationByCurrency(
        holdings,
        ilpTotalSum,
        cashBalance,
        fullPortfolioTotal,
      ),
    [holdings, ilpTotalSum, cashBalance, fullPortfolioTotal],
  )

  // By Instrument (each ticker as own slice)
  const allocationByHolding = useMemo(() => {
    const grouped = new Map<string, number>()
    holdings.forEach((h) => {
      const label = holdingDonutLabel(h.symbol, h.type)
      grouped.set(label, (grouped.get(label) || 0) + (h.currentValue ?? 0))
    })
    // Add ILP products individually
    for (const p of ilpProducts) {
      const fv = p.latestEntry?.fund_value ?? 0
      if (fv <= 0) continue
      const firstGroup = p.fund_group_memberships?.[0]
      const label = firstGroup
        ? `${firstGroup.group_name} · ${p.name}`
        : p.name
      grouped.set(label, (grouped.get(label) || 0) + fv)
    }
    if (cashBalance > 0) {
      grouped.set("Cash", (grouped.get("Cash") || 0) + cashBalance)
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
  }, [holdings, ilpProducts, cashBalance, fullPortfolioTotal])

  const hasData =
    allocationByType.length > 0 || allocationByMarket.length > 0

  const showLookThrough = useMemo(
    () => hasIlpLookThroughData(ilpProducts),
    [ilpProducts],
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Skeleton for insights row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={`alloc-insight-skeleton-${i}`} className="h-20 animate-pulse rounded-xl border bg-muted/30" />
          ))}
        </div>
        {/* Skeleton for donuts */}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border p-4">
            <ChartSkeleton height={320} />
          </div>
          <div className="rounded-xl border p-4">
            <ChartSkeleton height={320} />
          </div>
        </div>
      </div>
    )
  }

  if (!hasData) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
        No allocation data. Add holdings, cash, or ILP to see breakdown.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Snapshot Metrics */}
      <CollapsibleSection title="Portfolio Snapshot">
        <AllocationInsights
          holdings={holdings}
          ilpProducts={ilpProducts}
          cashBalance={cashBalance}
          ilpTotalSum={ilpTotalSum}
          fullPortfolioTotal={fullPortfolioTotal}
        />
      </CollapsibleSection>

      {/* Section 2: Allocation Donuts (2×2 grid) */}
      <CollapsibleSection title="Allocation Breakdown">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="overflow-hidden rounded-xl border p-4">
            <AllocationChart
              data={allocationByType}
              title="By Asset Class"
              legendMaxItems={3}
              height={360}
            />
          </div>
          <div className="overflow-hidden rounded-xl border p-4">
            <AllocationChart
              data={allocationByMarket}
              title="By Market"
              legendMaxItems={3}
              height={360}
            />
          </div>
          <div className="overflow-hidden rounded-xl border p-4">
            <AllocationChart
              data={allocationByCurrencyData}
              title="By Currency"
              legendMaxItems={3}
              height={360}
            />
          </div>
          <div className="overflow-hidden rounded-xl border p-4">
            <AllocationChart
              data={allocationByHolding}
              title="By Instrument"
              legendMaxItems={3}
              height={360}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 3: Concentration Table */}
      <CollapsibleSection title="Concentration Breakdown">
        <ConcentrationTable
          holdings={holdings}
          ilpProducts={ilpProducts}
          cashBalance={cashBalance}
          fullPortfolioTotal={fullPortfolioTotal}
        />
      </CollapsibleSection>

      {/* Section 4: ILP Look-Through (conditional) */}
      {showLookThrough && (
        <CollapsibleSection title="ILP Look-Through">
          <PortfolioLookThrough
            holdings={holdings}
            ilpProducts={ilpProducts}
            cashBalance={cashBalance}
          />
        </CollapsibleSection>
      )}
    </div>
  )
}
