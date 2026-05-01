"use client"

import { useState, useMemo, useCallback } from "react"
import dynamic from "next/dynamic"
import { SectionHeader } from "@/components/dashboard/section-header"
import { cn, formatCurrency } from "@/lib/utils"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { useApi } from "@/hooks/use-api"
import { useDataRefresh } from "@/hooks/use-data-refresh"
import { useToolbarAction } from "@/hooks/use-toolbar-action"
import { useRegisterToolbarFilter } from "@/components/layout/toolbar-filter-context"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ReliefBreakdown } from "@/components/dashboard/tax/relief-breakdown"
import type { HouseholdChargeableMarker } from "@/components/dashboard/tax/tax-bracket-ladder"
import { ManualReliefForm } from "@/components/dashboard/tax/manual-relief-form"
import { ActualTaxDialog } from "@/components/dashboard/tax/actual-tax-dialog"
import { MonthlyTaxDialog } from "@/components/dashboard/tax/monthly-tax-dialog"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import type { TaxSnapshot } from "@/lib/tax/tax-snapshot"
import { ReliefsBracketSummaryCard } from "@/components/dashboard/tax/reliefs-bracket-summary-card"
import { NoaComparison, type NoaData } from "@/components/dashboard/tax/noa-comparison"
import { GiroTimeline, type GiroInstalment } from "@/components/dashboard/tax/giro-timeline"
import { QuickTaxInput } from "@/components/dashboard/tax/quick-tax-input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const TaxComparison = dynamic(
  () =>
    import("@/components/dashboard/tax/tax-comparison").then(
      (m) => m.TaxComparison
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[300px] w-full rounded-xl" />,
  }
)

const TaxReliefDonut = dynamic(
  () =>
    import("@/components/dashboard/tax/tax-relief-donut").then(
      (m) => m.TaxReliefDonut
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[200px] w-full rounded-xl" />,
  }
)

interface TaxEntry {
  id: string
  profile_id: string
  year: number
  calculated_amount: number
  actual_amount: number | null
  created_at: string
}

interface TaxRelief {
  id: string
  profile_id: string
  year: number
  relief_type: string
  amount: number
  source?: "auto" | "manual"
  created_at: string
}

interface TaxProfile {
  id: string
  name: string
}

interface SuggestedRelief {
  profile_id: string
  relief_type: string
  amount: number
  label: string
}

interface NoaDataRow {
  profile_id: string
  year: number
  employment_income: number | null
  chargeable_income: number | null
  total_deductions: number | null
  donations_deduction: number | null
  reliefs_total: number | null
  tax_payable: number | null
  payment_due_date: string | null
  reliefs_json: Array<{ type: string; label: string; amount: number }>
  bracket_summary_json: Array<{
    label: string
    income: number
    rate: number | null
    tax: number
  }>
  is_on_giro: boolean
}

interface GiroScheduleRow {
  profile_id: string
  year: number
  schedule: GiroInstalment[]
  total_payable: number | null
  outstanding_balance: number
  source: string
}

export interface TaxData {
  entries: TaxEntry[]
  reliefs: TaxRelief[]
  profiles: TaxProfile[]
  profileDetails?: Record<string, { employmentIncome: number }>
  taxSnapshots?: Record<string, TaxSnapshot>
  taxSnapshotsNextYa?: Record<string, TaxSnapshot>
  suggestedReliefs?: SuggestedRelief[]
  noaData?: Record<string, NoaDataRow>
  giroSchedules?: Record<string, GiroScheduleRow>
}

const currentYear = new Date().getFullYear()
const YEAR_OPTIONS = [
  currentYear,
  currentYear - 1,
  currentYear - 2,
  currentYear - 3,
]

function daysLeftColor(daysLeft: number): string {
  if (daysLeft > 30) return "text-green-600 dark:text-green-400"
  if (daysLeft > 0) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

function formatSignedAmount(diff: number): string {
  const sign = diff >= 0 ? "+" : "-"
  return `${sign}$${formatCurrency(Math.abs(diff))}`
}

function diffColor(diff: number | null | undefined): string {
  if (diff == null) return "text-muted-foreground"
  if (diff < 0) return "text-green-600 dark:text-green-400"
  if (diff > 0) return "text-red-600 dark:text-red-400"
  return "text-muted-foreground"
}

function SuggestedReliefRow({
  suggestion,
  keyPrefix,
  onApply,
}: {
  readonly suggestion: SuggestedRelief
  readonly keyPrefix: string
  readonly onApply: (s: SuggestedRelief) => void
}) {
  return (
    <div
      key={`${keyPrefix}-${suggestion.relief_type}-${suggestion.label}`}
      className="flex items-center justify-between rounded-md border bg-blue-50/50 px-3 py-2 dark:bg-blue-950/20"
    >
      <div className="min-w-0 flex-1 text-sm">
        <span className="truncate font-medium capitalize">
          {suggestion.relief_type.replaceAll("_", " ")}
        </span>{" "}
        <span className="hidden text-muted-foreground sm:inline">
          — {suggestion.label}
        </span>
        <Badge variant="outline" className="ml-2 text-xs">
          ${formatCurrency(suggestion.amount)}
        </Badge>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        onClick={() => onApply(suggestion)}
      >
        Apply
      </Button>
    </div>
  )
}

function buildTaxUrl(
  profileId: string | null,
  familyId: string | null,
  year: number
): string | null {
  if (!profileId && !familyId) return null
  const url = new URL("/api/tax", "http://localhost")
  if (profileId) url.searchParams.set("profileId", profileId)
  else if (familyId) url.searchParams.set("familyId", familyId)
  url.searchParams.set("year", String(year))
  return `${url.pathname}${url.search}`
}

const EMPTY_DATA: TaxData = {
  entries: [],
  reliefs: [],
  profiles: [],
}

export function TaxClient({ initialData }: { readonly initialData: TaxData }) {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const { triggerRefresh } = useDataRefresh()
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [actualDialogOpen, setActualDialogOpen] = useState(false)
  const [actualDialogProfileId, setActualDialogProfileId] = useState<
    string | null
  >(null)
  const [actualDialogAmount, setActualDialogAmount] = useState<number | null>(
    null
  )
  const [monthlyDialogOpen, setMonthlyDialogOpen] = useState(false)
  const [monthlyDialogProfileId, setMonthlyDialogProfileId] = useState<
    string | null
  >(null)

  const apiPath = buildTaxUrl(activeProfileId, activeFamilyId, selectedYear)

  const { data: taxData, isLoading } = useApi<TaxData>(apiPath, {
    fallbackData: initialData,
  })

  const data = useMemo(() => taxData ?? EMPTY_DATA, [taxData])

  const entriesForYear = useMemo(
    () => data.entries.filter((e) => e.year === selectedYear),
    [data.entries, selectedYear]
  )
  const reliefsForYear = useMemo(
    () => data.reliefs.filter((r) => r.year === selectedYear),
    [data.reliefs, selectedYear]
  )

  const totalCalculated = useMemo(
    () => entriesForYear.reduce((s, e) => s + e.calculated_amount, 0),
    [entriesForYear]
  )
  const totalReliefs = useMemo(
    () => reliefsForYear.reduce((s, r) => s + r.amount, 0),
    [reliefsForYear]
  )
  const manualReliefTotal = useMemo(
    () =>
      reliefsForYear
        .filter((r) => r.source === "manual")
        .reduce((s, r) => s + r.amount, 0),
    [reliefsForYear]
  )
  const autoReliefTotal = useMemo(
    () =>
      reliefsForYear
        .filter((r) => r.source === "auto")
        .reduce((s, r) => s + r.amount, 0),
    [reliefsForYear]
  )
  // Use GIRO schedule if available, otherwise fall back to tax/12
  const primaryProfileId = entriesForYear[0]?.profile_id ?? null
  const primaryGiro = primaryProfileId
    ? data.giroSchedules?.[primaryProfileId]
    : null
  const primaryNoa = primaryProfileId
    ? data.noaData?.[primaryProfileId]
    : null

  const monthlyPayment = useMemo(() => {
    // If GIRO schedule exists, show the regular monthly amount
    if (primaryGiro && Array.isArray(primaryGiro.schedule) && primaryGiro.schedule.length > 0) {
      // Find the most common amount (the "regular" monthly)
      const amounts = primaryGiro.schedule.map((g: GiroInstalment) => g.amount)
      const freq = new Map<number, number>()
      for (const a of amounts) freq.set(a, (freq.get(a) ?? 0) + 1)
      let maxCount = 0
      let regularAmount = amounts[0]
      for (const [a, c] of freq) {
        if (c > maxCount) { maxCount = c; regularAmount = a }
      }
      return regularAmount
    }
    // Fallback: yearly tax / 12
    const yearly = entriesForYear.reduce((s, e) => {
      const part = e.actual_amount ?? e.calculated_amount
      return s + part
    }, 0)
    return Math.round((yearly / 12) * 100) / 100
  }, [entriesForYear, primaryGiro])

  const reliefsByProfile = useMemo(() => {
    const map = new Map<string, TaxRelief[]>()
    for (const r of reliefsForYear) {
      const list = map.get(r.profile_id) ?? []
      list.push(r)
      map.set(r.profile_id, list)
    }
    return map
  }, [reliefsForYear])

  const profileMap = useMemo(
    () => new Map(data.profiles.map((p) => [p.id, p.name])),
    [data.profiles]
  )

  const householdChargeableMarkers = useMemo(():
    | HouseholdChargeableMarker[]
    | undefined => {
    if (data.profiles.length <= 1) return undefined
    return data.profiles.map((p) => ({
      id: p.id,
      label: p.name,
      chargeableIncome:
        data.taxSnapshots?.[p.id]?.year === selectedYear
          ? (data.taxSnapshots[p.id]?.chargeableIncome ?? 0)
          : 0,
    }))
  }, [data.profiles, data.taxSnapshots, selectedYear])

  const primaryEntry = entriesForYear[0] ?? null

  const handleSaveManualReliefs = useCallback(
    async (
      reliefs: Array<{
        profile_id: string
        year: number
        relief_type: string
        amount: number
      }>
    ) => {
      const merged = new Map<
        string,
        {
          profile_id: string
          year: number
          relief_type: string
          amount: number
        }
      >()
      for (const r of reliefs) {
        const key = `${r.profile_id}:${r.relief_type}`
        const existing = merged.get(key)
        if (existing) {
          existing.amount += r.amount
        } else {
          merged.set(key, { ...r })
        }
      }
      const res = await fetch("/api/tax/reliefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reliefs: Array.from(merged.values()) }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? "Failed to save")
      triggerRefresh()
    },
    [triggerRefresh]
  )

  const handleApplySuggestion = useCallback(
    async (suggestion: SuggestedRelief) => {
      await handleSaveManualReliefs([
        // Preserve existing manual reliefs
        ...reliefsForYear
          .filter((r) => r.source === "manual")
          .map((r) => ({
            profile_id: r.profile_id,
            year: r.year,
            relief_type: r.relief_type,
            amount: r.amount,
          })),
        // Add the suggested one
        {
          profile_id: suggestion.profile_id,
          year: selectedYear,
          relief_type: suggestion.relief_type,
          amount: suggestion.amount,
        },
      ])
    },
    [handleSaveManualReliefs, reliefsForYear, selectedYear]
  )

  function openActualDialog(profileId: string, amount: number | null) {
    setActualDialogProfileId(profileId)
    setActualDialogAmount(amount)
    setActualDialogOpen(true)
  }

  function openMonthlyDialog(profileId: string) {
    setMonthlyDialogProfileId(profileId)
    setMonthlyDialogOpen(true)
  }

  const fallbackProfileId =
    activeProfileId ?? data.profiles[0]?.id ?? null

  useToolbarAction({
    "add-actual-tax": () => {
      if (fallbackProfileId) openActualDialog(fallbackProfileId, null)
    },
    "add-monthly-tax": () => {
      if (fallbackProfileId) openMonthlyDialog(fallbackProfileId)
    },
  })

  const yearPicker = useMemo(
    () => (
      <Select
        value={String(selectedYear)}
        onValueChange={(v) => setSelectedYear(Number(v))}
      >
        <SelectTrigger className="h-8 w-[110px]">
          <SelectValue placeholder="Year" />
        </SelectTrigger>
        <SelectContent>
          {YEAR_OPTIONS.map((y) => (
            <SelectItem key={y} value={String(y)}>
              YA {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ),
    [selectedYear]
  )

  // Mobile-only: register the year picker into the toolbar's filter slot.
  useRegisterToolbarFilter(yearPicker)

  const hasData = data.entries.length > 0

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Tax Planner"
        description="Estimated resident tax from your income and reliefs, bracket view, and IRAS comparison."
      >
        {/* Hide on mobile — the picker is rendered in the global toolbar there. */}
        <div className="hidden sm:flex">
          <Select
            value={String(selectedYear)}
            onValueChange={(v) => setSelectedYear(Number(v))}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  YA {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SectionHeader>

      {(() => {
        if (isLoading && !taxData) {
          return (
        <div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="min-w-0">
              <CardContent className="space-y-4 pt-6">
                <div>
                  <Skeleton className="mb-3 h-4 w-40" />
                  <Skeleton className="h-8 w-36" />
                </div>
                <div className="border-t border-border/60 pt-4">
                  <Skeleton className="mb-3 h-4 w-28" />
                  <Skeleton className="h-8 w-28" />
                </div>
              </CardContent>
            </Card>
            <Card className="min-w-0">
              <CardContent className="space-y-4 pt-6">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-9 w-36" />
                <div className="space-y-2 border-t border-border/60 pt-4">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-[80%] max-w-[12rem]" />
                </div>
              </CardContent>
            </Card>
            <Card className="min-w-0">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="mx-auto size-32 rounded-full" />
                <Skeleton className="mt-3 h-16 w-full" />
              </CardContent>
            </Card>
          </div>
        </div>
          )
        }
        if (!hasData) {
          return (
        <div className="space-y-4">
          <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
            No tax data found for this profile.
          </div>
          {data.profiles.length > 0 && (
            <QuickTaxInput
              year={selectedYear}
              profiles={data.profiles}
              onSuccess={triggerRefresh}
            />
          )}
        </div>
          )
        }
        return (
        <>
          <div>
            <div
              className={cn(
                "grid gap-4",
                reliefsForYear.length > 0
                  ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                  : "grid-cols-1 sm:grid-cols-2"
              )}
            >
              <Card className="min-w-0">
                <CardContent className="space-y-4 pt-6">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm text-muted-foreground">
                        YA {selectedYear} estimated tax
                      </p>
                      <InfoTooltip id="TAX_CALCULATED" />
                    </div>
                    <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">
                      ${formatCurrency(totalCalculated)}
                    </p>
                  </div>
                  <div className="border-t border-border/60 pt-4">
                    <p className="text-sm text-muted-foreground">
                      Monthly payment
                    </p>
                    <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">
                      ${formatCurrency(monthlyPayment)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {primaryGiro
                        ? "From GIRO schedule (regular monthly)."
                        : "Yearly tax ÷ 12 (actual IRAS total when entered, else estimate)."}
                    </p>
                    {primaryNoa?.payment_due_date && (() => {
                      const due = new Date(primaryNoa.payment_due_date)
                      const daysLeft = Math.ceil(
                        (due.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                      )
                      return (
                        <Badge
                          variant="outline"
                          className={cn(
                            "mt-2 text-xs",
                            daysLeftColor(daysLeft)
                          )}
                        >
                          {daysLeft > 0
                            ? `Due ${due.toLocaleDateString("en-SG", { day: "numeric", month: "short" })} (${daysLeft}d)`
                            : `Overdue`}
                        </Badge>
                      )
                    })()}
                  </div>
                </CardContent>
              </Card>
              <ReliefsBracketSummaryCard
                className="min-w-0"
                selectedYear={selectedYear}
                totalReliefs={totalReliefs}
                manualReliefTotal={manualReliefTotal}
                autoReliefTotal={autoReliefTotal}
                profiles={data.profiles}
                taxSnapshots={data.taxSnapshots}
                taxSnapshotsNextYa={data.taxSnapshotsNextYa}
                activeProfileId={activeProfileId}
              />
              {reliefsForYear.length > 0 ? (
                <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                  <CardHeader className="space-y-1.5 p-4 pb-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm leading-snug text-muted-foreground">
                        Relief breakdown
                      </p>
                      <InfoTooltip id="TAX_RELIEF_BY_CATEGORY" />
                    </div>
                    <CardDescription className="text-xs leading-snug">
                      Share of relief dollars for YA {selectedYear}
                      {data.profiles.length > 1
                        ? " (combined in this view)."
                        : "."}{" "}
                      Centre total is reliefs in the model, not tax.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="min-h-0 flex-1 overflow-y-auto p-3 pt-0 sm:p-4 sm:pt-0">
                    <TaxReliefDonut
                      compact
                      reliefs={reliefsForYear.map((r) => ({
                        relief_type: r.relief_type,
                        amount: r.amount,
                      }))}
                    />
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>

          {/* NOA Comparison — shown when NOA data imported */}
          {primaryNoa && primaryEntry && data.taxSnapshots?.[primaryEntry.profile_id] && (
            <NoaComparison
              noaData={primaryNoa as NoaData}
              estimate={{
                employmentIncome:
                  data.taxSnapshots[primaryEntry.profile_id]?.employmentIncome ?? 0,
                totalReliefs:
                  data.taxSnapshots[primaryEntry.profile_id]?.totalReliefs ?? 0,
                chargeableIncome:
                  data.taxSnapshots[primaryEntry.profile_id]?.chargeableIncome ?? 0,
                taxPayable:
                  data.taxSnapshots[primaryEntry.profile_id]?.taxPayable ?? 0,
                reliefBreakdown: reliefsForYear.map((r) => ({
                  type: r.relief_type,
                  amount: r.amount,
                  source: (r.source ?? "manual"),
                })),
              }}
            />
          )}

          {/* GIRO Timeline */}
          {primaryGiro &&
            Array.isArray(primaryGiro.schedule) &&
            primaryGiro.schedule.length > 0 && (
              <GiroTimeline
                schedule={primaryGiro.schedule}
                totalPayable={primaryGiro.total_payable ?? 0}
                outstandingBalance={primaryGiro.outstanding_balance}
                source={
                  primaryGiro.source as
                    | "calculated"
                    | "manual"
                    | "pdf_import"
                }
              />
            )}

          {entriesForYear.length > 0 && (
            <div className="space-y-4">
              {entriesForYear.map((entry, entryIndex) => (
                <TaxComparison
                  key={entry.id}
                  year={selectedYear}
                  profileId={entry.profile_id}
                  calculatedAmount={entry.calculated_amount}
                  actualAmount={entry.actual_amount}
                  snapshot={
                    data.taxSnapshots?.[entry.profile_id]?.year === selectedYear
                      ? (data.taxSnapshots[entry.profile_id] ?? null)
                      : null
                  }
                  onEnterActual={() =>
                    openActualDialog(entry.profile_id, entry.actual_amount)
                  }
                  onFromMonthly={() => openMonthlyDialog(entry.profile_id)}
                  profileName={
                    data.profiles.length > 1
                      ? profileMap.get(entry.profile_id)
                      : undefined
                  }
                  showMarginalPositionMarker={data.profiles.length <= 1}
                  marginalMarkerSubjectLabel={
                    profileMap.get(entry.profile_id) ?? "This profile"
                  }
                  householdChargeableMarkers={householdChargeableMarkers}
                  cardFooter={
                    data.profiles.length > 0 &&
                    entryIndex === entriesForYear.length - 1 ? (
                      <div className="space-y-3 rounded-xl border bg-muted/10 px-4 py-4">
                        {(data.suggestedReliefs ?? []).length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium">
                              Suggested Reliefs
                            </h4>
                            {(data.suggestedReliefs ?? []).map((s) => (
                              <SuggestedReliefRow
                                key={`relief-${s.relief_type}-${s.label}`}
                                suggestion={s}
                                keyPrefix="relief"
                                onApply={handleApplySuggestion}
                              />
                            ))}
                          </div>
                        )}
                        <div>
                          <h3 className="text-base font-medium leading-none">
                            Manual Reliefs
                          </h3>
                          <p className="mt-1.5 text-sm text-muted-foreground">
                            Add or edit SRS, donations, CPF top-up, course fees,
                            etc.
                          </p>
                        </div>
                        <ManualReliefForm
                          year={selectedYear}
                          profiles={data.profiles}
                          reliefs={reliefsForYear
                            .filter(
                              (r) => (r).source === "manual"
                            )
                            .map((r) => ({
                              id: r.id,
                              profile_id: r.profile_id,
                              year: r.year,
                              relief_type: r.relief_type,
                              amount: r.amount,
                            }))}
                          onSave={handleSaveManualReliefs}
                        />
                      </div>
                    ) : undefined
                  }
                />
              ))}
            </div>
          )}

          {data.profiles.length > 0 && entriesForYear.length === 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Manual Reliefs</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Add or edit SRS, donations, CPF top-up, course fees, etc.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {(data.suggestedReliefs ?? []).length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Suggested Reliefs</h4>
                    {(data.suggestedReliefs ?? []).map((s) => (
                      <SuggestedReliefRow
                        key={`mobile-relief-${s.relief_type}-${s.label}`}
                        suggestion={s}
                        keyPrefix="mobile-relief"
                        onApply={handleApplySuggestion}
                      />
                    ))}
                  </div>
                )}
                <ManualReliefForm
                  year={selectedYear}
                  profiles={data.profiles}
                  reliefs={reliefsForYear
                    .filter((r) => (r).source === "manual")
                    .map((r) => ({
                      id: r.id,
                      profile_id: r.profile_id,
                      year: r.year,
                      relief_type: r.relief_type,
                      amount: r.amount,
                    }))}
                  onSave={handleSaveManualReliefs}
                />
              </CardContent>
            </Card>
          )}

          {actualDialogProfileId && (
            <ActualTaxDialog
              open={actualDialogOpen}
              onOpenChange={setActualDialogOpen}
              profileId={actualDialogProfileId}
              year={selectedYear}
              initialAmount={actualDialogAmount}
              onSuccess={triggerRefresh}
            />
          )}

          {monthlyDialogProfileId && (
            <MonthlyTaxDialog
              open={monthlyDialogOpen}
              onOpenChange={setMonthlyDialogOpen}
              profileId={monthlyDialogProfileId}
              year={selectedYear}
              onSuccess={triggerRefresh}
            />
          )}

          {reliefsForYear.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Tax Reliefs — YA {selectedYear}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {data.profiles.length > 1 ? (
                  Array.from(reliefsByProfile.entries()).map(
                    ([profileId, reliefs]) => (
                      <ReliefBreakdown
                        key={profileId}
                        reliefs={reliefs}
                        profileName={profileMap.get(profileId)}
                        taxPayable={
                          entriesForYear.find(
                            (e) => e.profile_id === profileId
                          )?.calculated_amount ?? 0
                        }
                        employmentIncome={
                          data.profileDetails?.[profileId]?.employmentIncome ??
                          0
                        }
                      />
                    )
                  )
                ) : (
                  <ReliefBreakdown
                    reliefs={reliefsForYear}
                    taxPayable={primaryEntry?.calculated_amount ?? 0}
                    employmentIncome={
                      primaryEntry
                        ? (data.profileDetails?.[primaryEntry.profile_id]
                            ?.employmentIncome ?? 0)
                        : 0
                    }
                  />
                )}
              </CardContent>
            </Card>
          )}

          {data.entries.length > 1 && (
            <div className="overflow-hidden rounded-xl border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium">Year</th>
                      {data.profiles.length > 1 && (
                        <th className="px-4 py-3 text-left font-medium">
                          Profile
                        </th>
                      )}
                      <th className="px-4 py-3 text-right font-medium">
                        Estimated
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        Actual Paid
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        Difference
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((entry) => {
                      const diff =
                        entry.actual_amount == null
                          ? null
                          : entry.actual_amount - entry.calculated_amount
                      return (
                        <tr
                          key={entry.id}
                          className="border-b last:border-0"
                        >
                          <td className="px-4 py-3 font-medium">
                            YA {entry.year}
                          </td>
                          {data.profiles.length > 1 && (
                            <td className="max-w-[120px] truncate px-4 py-3 text-muted-foreground">
                              {profileMap.get(entry.profile_id) ?? "—"}
                            </td>
                          )}
                          <td className="px-4 py-3 text-right tabular-nums">
                            ${formatCurrency(entry.calculated_amount)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {entry.actual_amount == null
                              ? "—"
                              : `$${formatCurrency(entry.actual_amount)}`}
                          </td>
                          <td
                            className={`px-4 py-3 text-right tabular-nums ${
                              diffColor(diff)
                            }`}
                          >
                            {diff == null ? "—" : formatSignedAmount(diff)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
        )
      })()}
    </div>
  )
}
