"use client"

import { useMemo, useState, useCallback, useEffect } from "react"
import dynamic from "next/dynamic"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SectionHeader } from "@/components/dashboard/section-header"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { useGlobalMonth } from "@/hooks/use-global-month"
import { ChartSkeleton } from "@/components/loading"
import { useApi } from "@/hooks/use-api"
import { getCalendarYearRange } from "@/lib/date-range"
import { StatementUploadZone } from "@/components/dashboard/cashflow/statement-upload-zone"
import {
  SpendingBreakdownTab,
  type SpendingBreakdownInitialData,
} from "@/components/dashboard/cashflow/spending-breakdown-tab"
import { MonthlySpendingGrid } from "@/components/dashboard/cashflow/monthly-spending-grid"
import type { WaterfallDataV2 } from "@/components/dashboard/cashflow/waterfall-chart"
import type { ParsedResult } from "@/components/dashboard/cashflow/import-preview-dialog"

const CashflowChart = dynamic(
  () =>
    import("@/components/dashboard/cashflow/cashflow-chart").then(
      (m) => m.CashflowChart
    ),
  { ssr: false, loading: () => <ChartSkeleton className="h-[400px]" /> }
)

const SectionedWaterfall = dynamic(
  () =>
    import("@/components/dashboard/cashflow/sectioned-waterfall").then(
      (m) => m.SectionedWaterfall
    ),
  { ssr: false, loading: () => <ChartSkeleton className="h-[300px]" /> }
)

type CashflowEntry = {
  month: string
  inflow: number
  discretionary: number
  insurance: number
  ilp: number
  ilpOneTime: number
  loans: number
  earlyRepayments: number
  tax: number
  taxReliefCash: number
  savingsGoals: number
  investments: number
  totalOutflow: number
  inflowMemo?: string
  outflowMemo?: string
}

type CategorySummaryMonth = {
  month: string
  categories: Array<{ name: string; total: number; count: number }>
}

function buildCashflowUrl(
  profileId: string | null,
  familyId: string | null
): string | null {
  if (!profileId && !familyId) return null
  const { startMonth, endMonth } = getCalendarYearRange()
  const url = new URL("/api/cashflow", "http://localhost")
  if (profileId) url.searchParams.set("profileId", profileId)
  else if (familyId) url.searchParams.set("familyId", familyId)
  url.searchParams.set("startMonth", startMonth)
  url.searchParams.set("endMonth", endMonth)
  return `${url.pathname}${url.search}`
}

function buildCategorySummaryUrl(
  profileId: string | null,
  familyId: string | null
): string | null {
  if (!profileId && !familyId) return null
  const { startMonth, endMonth } = getCalendarYearRange()
  const params = new URLSearchParams()
  if (profileId) params.set("profileId", profileId)
  else if (familyId) params.set("familyId", familyId)
  params.set("startMonth", startMonth)
  params.set("endMonth", endMonth)
  return `/api/transactions/category-summary?${params.toString()}`
}

function buildWaterfallUrl(
  profileId: string | null,
  familyId: string | null,
  month: string
): string | null {
  if (!profileId && !familyId) return null
  if (!month) return null
  const params = new URLSearchParams()
  if (profileId) params.set("profileId", profileId)
  else if (familyId) params.set("familyId", familyId)
  params.set("month", month)
  return `/api/cashflow?${params.toString()}`
}

export function CashflowClient({
  initialData,
  initialWaterfallData,
  initialTransactionsData,
}: {
  readonly initialData: CashflowEntry[]
  readonly initialWaterfallData: WaterfallDataV2 | null
  readonly initialTransactionsData: SpendingBreakdownInitialData
}) {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const { effectiveMonth, setAvailableMonths } = useGlobalMonth()
  const searchParams = useSearchParams()
  const router = useRouter()

  const defaultTab =
    searchParams.get("tab") === "categories" ? "categories" : "overview"
  const [parsedResults, setParsedResults] = useState<ParsedResult[]>([])

  // 12-month cashflow range data
  const apiPath = buildCashflowUrl(activeProfileId, activeFamilyId)
  const { data: cashflowData, isLoading } = useApi<CashflowEntry[]>(apiPath, {
    fallbackData: initialData,
  })
  const data = useMemo(() => cashflowData ?? [], [cashflowData])

  // Sync available months to global context for TopNav picker
  const cashflowMonths = useMemo(
    () => data.map((r) => r.month).reverse(),
    [data]
  )
  useEffect(() => {
    if (cashflowMonths.length > 0) {
      setAvailableMonths(cashflowMonths)
    }
  }, [cashflowMonths, setAvailableMonths])

  // Single-month waterfall data
  const waterfallUrl = buildWaterfallUrl(
    activeProfileId,
    activeFamilyId,
    effectiveMonth
  )
  const { data: waterfallData } = useApi<WaterfallDataV2>(waterfallUrl, {
    fallbackData: initialWaterfallData ?? undefined,
  })

  // 12-month category summary for donut grid
  const categorySummaryUrl = buildCategorySummaryUrl(
    activeProfileId,
    activeFamilyId
  )
  const { data: categorySummary } = useApi<CategorySummaryMonth[]>(
    categorySummaryUrl,
    { fallbackData: [] }
  )

  // Build a lookup of bank transaction totals by month key (YYYY-MM-01)
  const bankTotalsByMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of categorySummary ?? []) {
      const total = m.categories.reduce((sum, c) => sum + c.total, 0)
      if (total > 0) map.set(m.month, total)
    }
    return map
  }, [categorySummary])

  const chartData = useMemo(() => {
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ]
    return data
      .map((entry) => {
        const date = new Date(entry.month)
        const year = date.getFullYear()
        const monthLabel = `${monthNames[date.getMonth()]} ${year}`
        // Prioritize bank transaction total over manual discretionary entry
        const bankTotal = bankTotalsByMonth.get(entry.month)
        return {
          month: monthLabel,
          sortKey: entry.month,
          inflow: entry.inflow,
          discretionary: bankTotal ?? entry.discretionary,
          insurance: entry.insurance,
          ilp: entry.ilp,
          ilpOneTime: entry.ilpOneTime ?? 0,
          loans: entry.loans,
          earlyRepayments: entry.earlyRepayments ?? 0,
          tax: entry.tax,
          taxReliefCash: entry.taxReliefCash ?? 0,
          savingsGoals: entry.savingsGoals ?? 0,
          investments: entry.investments ?? 0,
        }
      })
      .sort((a, b) => (a.sortKey ?? "").localeCompare(b.sortKey ?? ""))
  }, [data, bankTotalsByMonth])

  const handleBatchParsed = useCallback((results: ParsedResult[]) => {
    setParsedResults(results)
  }, [])

  const handleImportComplete = useCallback(() => {
    setParsedResults([])
  }, [])

  function handleTabChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "categories") {
      params.set("tab", "categories")
    } else {
      params.delete("tab")
    }
    router.replace(`/dashboard/cashflow?${params.toString()}`, {
      scroll: false,
    })
  }

  const monthNames: Record<string, string> = {
    "01": "Jan",
    "02": "Feb",
    "03": "Mar",
    "04": "Apr",
    "05": "May",
    "06": "Jun",
    "07": "Jul",
    "08": "Aug",
    "09": "Sep",
    "10": "Oct",
    "11": "Nov",
    "12": "Dec",
  }

  function formatMonth(monthStr: string): string {
    const [year, month] = monthStr.split("-")
    return `${monthNames[month ?? ""] ?? month} ${year}`
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Cashflow"
        description="Monthly inflow vs outflow with spending breakdown and statement uploads."
      />

      <Tabs defaultValue={defaultTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="categories">Manage Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-6">
            {isLoading && data.length === 0 ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>{new Date().getFullYear()} Cashflow</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartSkeleton height={300} />
                  </CardContent>
                </Card>
                <ChartSkeleton height={300} />
              </>
            ) : data.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
                No cashflow data found for this profile.
              </div>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>{new Date().getFullYear()} Cashflow</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CashflowChart data={chartData} />
                  </CardContent>
                </Card>

                {(categorySummary ?? []).length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Spending by Category</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <MonthlySpendingGrid data={categorySummary ?? []} />
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle>Monthly Breakdown</CardTitle>
                    {effectiveMonth && (
                      <p className="text-xs text-muted-foreground">
                        {formatMonth(effectiveMonth)}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent>
                    {waterfallData ? (
                      <SectionedWaterfall data={waterfallData} />
                    ) : (
                      <ChartSkeleton height={300} />
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="categories">
          <div className="space-y-6">
            <StatementUploadZone onBatchParsed={handleBatchParsed} />
            <SpendingBreakdownTab
              initialData={initialTransactionsData}
              parsedResults={parsedResults}
              onImportComplete={handleImportComplete}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
