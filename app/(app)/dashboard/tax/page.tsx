"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { SectionHeader } from "@/components/dashboard/section-header"
import { formatCurrency } from "@/lib/utils"
import { MetricCard } from "@/components/dashboard/metric-card"
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

interface TaxData {
  entries: TaxEntry[]
  reliefs: TaxRelief[]
  profiles: TaxProfile[]
  profileDetails?: Record<string, { employmentIncome: number }>
  taxSnapshots?: Record<string, TaxSnapshot>
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
        title="Tax"
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
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="" value={0} loading />
            <MetricCard label="" value={0} loading />
            <MetricCard label="" value={0} loading />
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      ) : !hasData ? (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
          No tax data found for this profile.
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label={`YA ${selectedYear} estimated tax`}
              value={totalCalculated}
              prefix="$"
              tooltipId="TAX_CALCULATED"
            />
            <MetricCard
              label="Monthly Payment"
              value={monthlyPayment}
              prefix="$"
            />
            <MetricCard
              label="Total Reliefs"
              value={totalReliefs}
              prefix="$"
              tooltipId="TAX_RELIEF_INPUTS"
            />
          </div>

          {entriesForYear.length > 0 && (
            <div className="space-y-4">
              {entriesForYear.map((entry) => (
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
                />
              ))}
            </div>
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

          {reliefsForYear.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-1.5">
                  <CardTitle className="text-base">
                    Relief breakdown by category
                  </CardTitle>
                  <InfoTooltip id="TAX_RELIEF_BY_CATEGORY" />
                </div>
                <CardDescription>
                  Share of total relief dollars for YA {selectedYear}
                  {data.profiles.length > 1
                    ? " (combined across profiles in this view)."
                    : "."}{" "}
                  The centre total is not tax — it is how much relief entered the
                  model (subject to the $80k cap when computing tax).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TaxReliefDonut
                  reliefs={reliefsForYear.map((r) => ({
                    relief_type: r.relief_type,
                    amount: r.amount,
                  }))}
                />
              </CardContent>
            </Card>
          )}

          {data.profiles.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Manual Reliefs</CardTitle>
              <p className="text-sm text-muted-foreground">
                Add or edit SRS, donations, CPF top-up, course fees, etc.
              </p>
            </CardHeader>
            <CardContent>
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
