"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { SectionHeader } from "@/components/dashboard/section-header"
import { cn, formatCurrency } from "@/lib/utils"
import { useActiveProfile } from "@/hooks/use-active-profile"
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
import { TaxComparison } from "@/components/dashboard/tax/tax-comparison"
import type { HouseholdChargeableMarker } from "@/components/dashboard/tax/tax-bracket-ladder"
import { TaxReliefDonut } from "@/components/dashboard/tax/tax-relief-donut"
import { ManualReliefForm } from "@/components/dashboard/tax/manual-relief-form"
import { ActualTaxDialog } from "@/components/dashboard/tax/actual-tax-dialog"
import { MonthlyTaxDialog } from "@/components/dashboard/tax/monthly-tax-dialog"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import type { TaxSnapshot } from "@/lib/tax/tax-snapshot"
import { ReliefsBracketSummaryCard } from "@/components/dashboard/tax/reliefs-bracket-summary-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

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

interface TaxData {
  entries: TaxEntry[]
  reliefs: TaxRelief[]
  profiles: TaxProfile[]
  profileDetails?: Record<string, { employmentIncome: number }>
  taxSnapshots?: Record<string, TaxSnapshot>
  taxSnapshotsNextYa?: Record<string, TaxSnapshot>
  suggestedReliefs?: SuggestedRelief[]
}

const currentYear = new Date().getFullYear()
const YEAR_OPTIONS = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3]

export default function TaxPage() {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [data, setData] = useState<TaxData>({ entries: [], reliefs: [], profiles: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [actualDialogOpen, setActualDialogOpen] = useState(false)
  const [actualDialogProfileId, setActualDialogProfileId] = useState<string | null>(null)
  const [actualDialogAmount, setActualDialogAmount] = useState<number | null>(null)
  const [monthlyDialogOpen, setMonthlyDialogOpen] = useState(false)
  const [monthlyDialogProfileId, setMonthlyDialogProfileId] = useState<string | null>(null)

  const fetchTax = useCallback(async () => {
    if (!activeProfileId && !activeFamilyId) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const url = new URL("/api/tax", window.location.origin)
      if (activeProfileId) url.searchParams.set("profileId", activeProfileId)
      else if (activeFamilyId) url.searchParams.set("familyId", activeFamilyId)
      url.searchParams.set("year", String(selectedYear))

      const res = await fetch(url)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (error) {
      console.error("Failed to fetch tax:", error)
    } finally {
      setIsLoading(false)
    }
  }, [activeProfileId, activeFamilyId, selectedYear])

  useEffect(() => {
    fetchTax()
  }, [fetchTax])

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
  const monthlyPayment = useMemo(() => {
    const yearly = entriesForYear.reduce((s, e) => {
      const part =
        e.actual_amount != null ? e.actual_amount : e.calculated_amount
      return s + part
    }, 0)
    return Math.round((yearly / 12) * 100) / 100
  }, [entriesForYear])

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

  async function handleSaveManualReliefs(reliefs: Array<{ profile_id: string; year: number; relief_type: string; amount: number }>) {
    const merged = new Map<string, { profile_id: string; year: number; relief_type: string; amount: number }>()
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
    fetchTax()
  }

  async function handleApplySuggestion(suggestion: SuggestedRelief) {
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
  }

  function openActualDialog(profileId: string, amount: number | null) {
    setActualDialogProfileId(profileId)
    setActualDialogAmount(amount)
    setActualDialogOpen(true)
  }

  function openMonthlyDialog(profileId: string) {
    setMonthlyDialogProfileId(profileId)
    setMonthlyDialogOpen(true)
  }

  const hasData = data.entries.length > 0

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Tax Planner"
        description="Estimated resident tax from your income and reliefs, bracket view, and IRAS comparison."
      >
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
      </SectionHeader>

      {isLoading ? (
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
                  <Skeleton className="h-3 max-w-[12rem] w-[80%]" />
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
      ) : !hasData ? (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
          No tax data found for this profile.
        </div>
      ) : (
        <>
          <div>
            <div
              className={cn(
                "grid gap-4",
                reliefsForYear.length > 0
                  ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                  : "grid-cols-1 sm:grid-cols-2",
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
                    <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
                      ${formatCurrency(totalCalculated)}
                    </p>
                  </div>
                  <div className="border-t border-border/60 pt-4">
                    <p className="text-sm text-muted-foreground">
                      Monthly payment
                    </p>
                    <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
                      ${formatCurrency(monthlyPayment)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Yearly tax ÷ 12 (actual IRAS total when entered, else
                      estimate).
                    </p>
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
                            <h4 className="text-sm font-medium">Suggested Reliefs</h4>
                            {(data.suggestedReliefs ?? []).map((s, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between rounded-md border bg-blue-50/50 px-3 py-2 dark:bg-blue-950/20"
                              >
                                <div className="text-sm">
                                  <span className="font-medium capitalize">
                                    {s.relief_type.replace(/_/g, " ")}
                                  </span>
                                  {" "}
                                  <span className="text-muted-foreground">
                                    — {s.label}
                                  </span>
                                  <Badge variant="outline" className="ml-2 text-xs">
                                    ${formatCurrency(s.amount)}
                                  </Badge>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleApplySuggestion(s)}
                                >
                                  Apply
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div>
                          <h3 className="text-base font-medium leading-none">
                            Manual Reliefs
                          </h3>
                          <p className="mt-1.5 text-sm text-muted-foreground">
                            Add or edit SRS, donations, CPF top-up, course
                            fees, etc.
                          </p>
                        </div>
                        <ManualReliefForm
                          year={selectedYear}
                          profiles={data.profiles}
                          reliefs={reliefsForYear
                            .filter((r) => (r as TaxRelief).source === "manual")
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
                    {(data.suggestedReliefs ?? []).map((s, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-md border bg-blue-50/50 px-3 py-2 dark:bg-blue-950/20"
                      >
                        <div className="text-sm">
                          <span className="font-medium capitalize">
                            {s.relief_type.replace(/_/g, " ")}
                          </span>
                          {" "}
                          <span className="text-muted-foreground">
                            — {s.label}
                          </span>
                          <Badge variant="outline" className="ml-2 text-xs">
                            ${formatCurrency(s.amount)}
                          </Badge>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleApplySuggestion(s)}
                        >
                          Apply
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <ManualReliefForm
                  year={selectedYear}
                  profiles={data.profiles}
                  reliefs={reliefsForYear
                    .filter((r) => (r as TaxRelief).source === "manual")
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
              onSuccess={fetchTax}
            />
          )}

          {monthlyDialogProfileId && (
            <MonthlyTaxDialog
              open={monthlyDialogOpen}
              onOpenChange={setMonthlyDialogOpen}
              profileId={monthlyDialogProfileId}
              year={selectedYear}
              onSuccess={fetchTax}
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
                  Array.from(reliefsByProfile.entries()).map(([profileId, reliefs]) => (
                    <ReliefBreakdown
                      key={profileId}
                      reliefs={reliefs}
                      profileName={profileMap.get(profileId)}
                      taxPayable={
                        entriesForYear.find((e) => e.profile_id === profileId)
                          ?.calculated_amount ?? 0
                      }
                      employmentIncome={
                        data.profileDetails?.[profileId]?.employmentIncome ?? 0
                      }
                    />
                  ))
                ) : (
                  <ReliefBreakdown
                    reliefs={reliefsForYear}
                    taxPayable={primaryEntry?.calculated_amount ?? 0}
                    employmentIncome={
                      primaryEntry
                        ? (data.profileDetails?.[primaryEntry.profile_id]?.employmentIncome ?? 0)
                        : 0
                    }
                  />
                )}
              </CardContent>
            </Card>
          )}

          {data.entries.length > 1 && (
            <div className="rounded-xl border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium">Year</th>
                      {data.profiles.length > 1 && (
                        <th className="px-4 py-3 text-left font-medium">Profile</th>
                      )}
                      <th className="px-4 py-3 text-right font-medium">Estimated</th>
                      <th className="px-4 py-3 text-right font-medium">Actual Paid</th>
                      <th className="px-4 py-3 text-right font-medium">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((entry) => {
                      const diff =
                        entry.actual_amount != null
                          ? entry.actual_amount - entry.calculated_amount
                          : null
                      return (
                        <tr
                          key={entry.id}
                          className="border-b last:border-0"
                        >
                          <td className="px-4 py-3 font-medium">YA {entry.year}</td>
                          {data.profiles.length > 1 && (
                            <td className="px-4 py-3 text-muted-foreground">
                              {profileMap.get(entry.profile_id) ?? "—"}
                            </td>
                          )}
                          <td className="px-4 py-3 text-right tabular-nums">
                            ${formatCurrency(entry.calculated_amount)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {entry.actual_amount != null
                              ? `$${formatCurrency(entry.actual_amount)}`
                              : "—"}
                          </td>
                          <td
                            className={`px-4 py-3 text-right tabular-nums ${
                              diff != null && diff < 0
                                ? "text-green-600 dark:text-green-400"
                                : diff != null && diff > 0
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {diff != null
                              ? `${diff >= 0 ? "+" : "-"}$${formatCurrency(Math.abs(diff))}`
                              : "—"}
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
      )}
    </div>
  )
}
