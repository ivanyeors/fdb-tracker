"use client"

import { useMemo, useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MetricCard } from "@/components/dashboard/metric-card"
import { SectionHeader } from "@/components/dashboard/section-header"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { ChartSkeleton } from "@/components/loading"
import { useApi } from "@/hooks/use-api"
import { StatementUploadZone } from "@/components/dashboard/cashflow/statement-upload-zone"
import {
  SpendingBreakdownTab,
  type SpendingBreakdownInitialData,
} from "@/components/dashboard/cashflow/spending-breakdown-tab"
import type { ParsedResult } from "@/components/dashboard/cashflow/import-preview-dialog"

const CashflowChart = dynamic(
  () =>
    import("@/components/dashboard/cashflow/cashflow-chart").then(
      (m) => m.CashflowChart
    ),
  { ssr: false, loading: () => <ChartSkeleton className="h-[400px]" /> }
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

function getDateRange() {
  const now = new Date()
  const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  now.setMonth(now.getMonth() - 11)
  const startMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  return { startMonth, endMonth }
}

function buildCashflowUrl(
  profileId: string | null,
  familyId: string | null
): string | null {
  if (!profileId && !familyId) return null
  const { startMonth, endMonth } = getDateRange()
  const url = new URL("/api/cashflow", "http://localhost")
  if (profileId) url.searchParams.set("profileId", profileId)
  else if (familyId) url.searchParams.set("familyId", familyId)
  url.searchParams.set("startMonth", startMonth)
  url.searchParams.set("endMonth", endMonth)
  return `${url.pathname}${url.search}`
}

export function CashflowClient({
  initialData,
  initialTransactionsData,
}: {
  initialData: CashflowEntry[]
  initialTransactionsData: SpendingBreakdownInitialData
}) {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const searchParams = useSearchParams()
  const router = useRouter()

  const defaultTab =
    searchParams.get("tab") === "spending" ? "spending" : "overview"
  const [parsedResults, setParsedResults] = useState<ParsedResult[]>([])

  const apiPath = buildCashflowUrl(activeProfileId, activeFamilyId)

  const { data: cashflowData, isLoading } = useApi<CashflowEntry[]>(apiPath, {
    fallbackData: initialData,
  })

  const data = useMemo(() => cashflowData ?? [], [cashflowData])

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
        return {
          month: monthLabel,
          sortKey: entry.month,
          inflow: entry.inflow,
          discretionary: entry.discretionary,
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
  }, [data])

  const currentMonthMetrics = useMemo(() => {
    if (data.length === 0)
      return {
        inflow: 0,
        outflow: 0,
        inflowMemo: undefined as string | undefined,
        outflowMemo: undefined as string | undefined,
      }
    const sorted = [...data].sort((a, b) => b.month.localeCompare(a.month))
    const latest = sorted[0]
    return {
      inflow: latest?.inflow ?? 0,
      outflow: latest?.totalOutflow ?? 0,
      inflowMemo: latest?.inflowMemo,
      outflowMemo: latest?.outflowMemo,
    }
  }, [data])

  const netSavings = currentMonthMetrics.inflow - currentMonthMetrics.outflow

  const handleBatchParsed = useCallback((results: ParsedResult[]) => {
    setParsedResults(results)
  }, [])

  const handleImportComplete = useCallback(() => {
    setParsedResults([])
  }, [])

  function handleTabChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "spending") {
      params.set("tab", "spending")
    } else {
      params.delete("tab")
    }
    router.replace(`/dashboard/cashflow?${params.toString()}`, {
      scroll: false,
    })
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
          <TabsTrigger value="spending">Spending Breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-6">
            {isLoading && data.length === 0 ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>12-Month Cashflow</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartSkeleton height={300} />
                  </CardContent>
                </Card>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <MetricCard label="" value={0} loading />
                  <MetricCard label="" value={0} loading />
                  <MetricCard label="" value={0} loading />
                </div>
              </>
            ) : data.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
                No cashflow data found for this profile.
              </div>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>12-Month Cashflow</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CashflowChart data={chartData} />
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <MetricCard
                    label="Inflow"
                    value={currentMonthMetrics.inflow}
                    prefix="$"
                  />
                  <MetricCard
                    label="Outflow"
                    value={currentMonthMetrics.outflow}
                    prefix="$"
                  />
                  <MetricCard
                    label="Net Savings"
                    value={netSavings}
                    prefix="$"
                  />
                </div>

                <MetricCard
                  label="Savings Rate"
                  value={
                    currentMonthMetrics.inflow > 0
                      ? Math.round(
                          (netSavings / currentMonthMetrics.inflow) * 100
                        )
                      : 0
                  }
                  suffix="%"
                  tooltipId="SAVINGS_RATE"
                />

                {(currentMonthMetrics.inflowMemo ||
                  currentMonthMetrics.outflowMemo) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        This month&apos;s notes
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-muted-foreground">
                      {currentMonthMetrics.inflowMemo ? (
                        <p>
                          <span className="font-medium text-foreground">
                            Inflow:{" "}
                          </span>
                          {currentMonthMetrics.inflowMemo}
                        </p>
                      ) : null}
                      {currentMonthMetrics.outflowMemo ? (
                        <p>
                          <span className="font-medium text-foreground">
                            Outflow:{" "}
                          </span>
                          {currentMonthMetrics.outflowMemo}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="spending">
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
