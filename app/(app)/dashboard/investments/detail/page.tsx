"use client"

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

const HOLDINGS: Holding[] = [
  {
    symbol: "DBS",
    type: "stock",
    units: 200,
    costBasis: 6800,
    currentPrice: 36,
    currentValue: 7200,
    pnl: 400,
    pnlPct: 5.88,
    portfolioPct: 7.78,
  },
  {
    symbol: "OCBC",
    type: "stock",
    units: 150,
    costBasis: 1875,
    currentPrice: 13.5,
    currentValue: 2025,
    pnl: 150,
    pnlPct: 8.0,
    portfolioPct: 2.19,
  },
  {
    symbol: "AAPL",
    type: "stock",
    units: 10,
    costBasis: 2150,
    currentPrice: 235,
    currentValue: 2350,
    pnl: 200,
    pnlPct: 9.3,
    portfolioPct: 2.54,
  },
  {
    symbol: "Gold",
    type: "gold",
    units: 1.5,
    costBasis: 6000,
    currentPrice: 4250,
    currentValue: 6375,
    pnl: 375,
    pnlPct: 6.25,
    portfolioPct: 6.89,
  },
  {
    symbol: "Silver",
    type: "silver",
    units: 50,
    costBasis: 2400,
    currentPrice: 49,
    currentValue: 2450,
    pnl: 50,
    pnlPct: 2.08,
    portfolioPct: 2.65,
  },
  {
    symbol: "Prudential ILP",
    type: "ilp",
    units: 1,
    costBasis: 12000,
    currentPrice: 13200,
    currentValue: 13200,
    pnl: 1200,
    pnlPct: 10.0,
    portfolioPct: 14.27,
  },
  {
    symbol: "AIA ILP",
    type: "ilp",
    units: 1,
    costBasis: 8000,
    currentPrice: 8500,
    currentValue: 8500,
    pnl: 500,
    pnlPct: 6.25,
    portfolioPct: 9.19,
  },
  {
    symbol: "STI ETF",
    type: "etf",
    units: 100,
    costBasis: 3200,
    currentPrice: 34,
    currentValue: 3400,
    pnl: 200,
    pnlPct: 6.25,
    portfolioPct: 3.68,
  },
]

const ALLOCATION_BY_TYPE = [
  { name: "Stocks", value: 11575, percentage: 25 },
  { name: "Gold", value: 6375, percentage: 14 },
  { name: "Silver", value: 2450, percentage: 5 },
  { name: "ILP", value: 21700, percentage: 47 },
  { name: "ETF", value: 3400, percentage: 7 },
]

const ALLOCATION_BY_MARKET = [
  { name: "SGX", value: 12625, percentage: 27 },
  { name: "US", value: 2350, percentage: 5 },
  { name: "Precious Metals", value: 8825, percentage: 19 },
  { name: "ILP", value: 21700, percentage: 47 },
]

const PRUDENTIAL_MONTHLY = [
  { month: "Oct", value: 12200 },
  { month: "Nov", value: 12500 },
  { month: "Dec", value: 12800 },
  { month: "Jan", value: 12600 },
  { month: "Feb", value: 13000 },
  { month: "Mar", value: 13200 },
]

const AIA_MONTHLY = [
  { month: "Oct", value: 8100 },
  { month: "Nov", value: 8000 },
  { month: "Dec", value: 8200 },
  { month: "Jan", value: 8150 },
  { month: "Feb", value: 8350 },
  { month: "Mar", value: 8500 },
]

const METALS = [
  {
    type: "gold" as const,
    unitsOz: 1.5,
    buyPrice: 4300,
    sellPrice: 4250,
    currentValue: 6375,
    costBasis: 6000,
    pnl: 375,
    pnlPct: 6.25,
    lastUpdated: "2026-03-08 09:00 SGT",
  },
  {
    type: "silver" as const,
    unitsOz: 50,
    buyPrice: 50,
    sellPrice: 49,
    currentValue: 2450,
    costBasis: 2400,
    pnl: 50,
    pnlPct: 2.08,
    lastUpdated: "2026-03-08 09:00 SGT",
  },
]

const JOURNAL_ENTRIES: JournalEntry[] = [
  {
    id: "j1",
    symbol: "DBS",
    type: "buy",
    quantity: 50,
    price: 34.0,
    journalText: "Added on dip, long term hold",
    date: "2026-03-01",
  },
  {
    id: "j2",
    symbol: "AAPL",
    type: "buy",
    quantity: 5,
    price: 215.0,
    journalText: "Post-earnings entry",
    date: "2026-02-15",
  },
  {
    id: "j3",
    symbol: "OCBC",
    type: "sell",
    quantity: 25,
    price: 14.5,
    journalText: "Took partial profits",
    date: "2026-02-01",
  },
  {
    id: "j4",
    symbol: "DBS",
    type: "buy",
    quantity: 100,
    price: 33.5,
    journalText: "Initial position",
    date: "2026-01-20",
  },
  {
    id: "j5",
    symbol: "Gold",
    type: "buy",
    quantity: 0.5,
    price: 4200,
    journalText: "Starting gold position via OCBC",
    date: "2026-01-10",
  },
]

export default function InvestmentsDetailPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Investments Detail"
        description="Full holdings, journals, and market breakdown."
      />

      <Tabs defaultValue="holdings">
        <div className="-mx-1 overflow-x-auto [overscroll-behavior-x:contain] [-webkit-overflow-scrolling:touch]">
          <TabsList className="inline-flex w-fit flex-nowrap">
            <TabsTrigger value="holdings">Holdings</TabsTrigger>
          <TabsTrigger value="allocation">Allocation</TabsTrigger>
          <TabsTrigger value="ilp">ILP</TabsTrigger>
          <TabsTrigger value="metals">Precious Metals</TabsTrigger>
          <TabsTrigger value="journals">Journals</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="holdings" className="mt-4">
          <HoldingsTable holdings={HOLDINGS} />
        </TabsContent>

        <TabsContent value="allocation" className="mt-4">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border p-4">
              <AllocationChart data={ALLOCATION_BY_TYPE} title="By Type" />
            </div>
            <div className="rounded-xl border p-4">
              <AllocationChart data={ALLOCATION_BY_MARKET} title="By Market" />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ilp" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <IlpCard
              name="Prudential ILP"
              fundValue={13200}
              totalPremiumsPaid={12000}
              returnPct={10.0}
              monthlyPremium={500}
              monthlyData={PRUDENTIAL_MONTHLY}
            />
            <IlpCard
              name="AIA ILP"
              fundValue={8500}
              totalPremiumsPaid={8000}
              returnPct={6.25}
              monthlyPremium={350}
              monthlyData={AIA_MONTHLY}
            />
          </div>
        </TabsContent>

        <TabsContent value="metals" className="mt-4">
          <div className="max-w-lg">
            <PreciousMetals metals={METALS} />
          </div>
        </TabsContent>

        <TabsContent value="journals" className="mt-4 space-y-6">
          <JournalList entries={JOURNAL_ENTRIES} />
          <div className="rounded-xl border p-4">
            <h3 className="mb-4 text-sm font-medium">Add Journal Entry</h3>
            <JournalForm />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
