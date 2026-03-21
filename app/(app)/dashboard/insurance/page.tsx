"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Check, X, DollarSign, Percent } from "lucide-react"
import { SectionHeader } from "@/components/dashboard/section-header"
import { MetricCard } from "@/components/dashboard/metric-card"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { getDpsAnnualPremium } from "@/lib/calculations/cpf-dps"
import { getAge } from "@/lib/calculations/cpf"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { RadarChart } from "@/components/dashboard/insurance/radar-chart"
import { GapBars } from "@/components/dashboard/insurance/gap-bars"
import { CoverageTable } from "@/components/dashboard/insurance/coverage-table"
import { PremiumCalendar } from "@/components/dashboard/insurance/premium-calendar"
import type {
  HouseholdCoverageAnalysis,
  ProfileCoverageAnalysis,
  CoverageGapItem,
} from "@/lib/calculations/insurance"

interface Policy {
  id: string
  profile_id: string
  name: string
  type: string
  premium_amount: number
  frequency: string
  yearly_outflow_date: number | null
  coverage_amount: number | null
  coverage_type: string | null
  is_active: boolean
  deduct_from_outflow: boolean
  created_at: string
}

const TAB_SET = new Set(["overview", "coverage", "policies", "premiums"])

const RADAR_AXES = ["Death", "Critical Illness", "Hospitalization", "Disability"]
const RADAR_COVERAGE_TYPES = ["death", "critical_illness", "hospitalization", "disability"]
const PROFILE_COLORS = ["var(--color-chart-1)", "var(--color-chart-2)"]

function radarValueFromItem(item: CoverageGapItem): number {
  if (item.coverageType === "hospitalization") {
    return item.hasCoverage ? 100 : 0
  }
  if (item.needed === 0) return item.hasCoverage ? 100 : 0
  return Math.min(item.held / item.needed, 1) * 100
}

function buildRadarSeries(
  profiles: ProfileCoverageAnalysis[],
  activeProfileId: string | null,
) {
  const filtered = activeProfileId
    ? profiles.filter((p) => p.profileId === activeProfileId)
    : profiles

  return filtered.map((profile, i) => ({
    profileName: profile.profileName,
    color: PROFILE_COLORS[i % PROFILE_COLORS.length],
    data: RADAR_COVERAGE_TYPES.map((ct, idx) => {
      const item = profile.items.find((it) => it.coverageType === ct)
      return {
        axis: RADAR_AXES[idx],
        value: item ? radarValueFromItem(item) : 0,
        profileName: profile.profileName,
      }
    }),
  }))
}

export default function InsurancePage() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const defaultTab = tabParam && TAB_SET.has(tabParam) ? tabParam : "overview"

  const { activeProfileId, activeFamilyId, profiles } = useActiveProfile()
  const [policies, setPolicies] = useState<Policy[]>([])
  const [coverageData, setCoverageData] =
    useState<HouseholdCoverageAnalysis | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showDollars, setShowDollars] = useState(false)

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

      const [policiesRes, coverageRes] = await Promise.all([
        fetch(`/api/insurance?${params}`),
        fetch(`/api/insurance/coverage?${params}`),
      ])

      if (policiesRes.ok) setPolicies(await policiesRes.json())
      if (coverageRes.ok) setCoverageData(await coverageRes.json())
    } catch (error) {
      console.error("Failed to fetch insurance data:", error)
    } finally {
      setIsLoading(false)
    }
  }, [activeProfileId, activeFamilyId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const activePolicies = useMemo(
    () => policies.filter((p) => p.is_active),
    [policies],
  )

  const totalAnnualPremium = useMemo(() => {
    return activePolicies.reduce((sum, p) => {
      const annual =
        p.frequency === "monthly" ? p.premium_amount * 12 : p.premium_amount
      return sum + annual
    }, 0)
  }, [activePolicies])

  const totalCoverage = useMemo(
    () => activePolicies.reduce((sum, p) => sum + (p.coverage_amount || 0), 0),
    [activePolicies],
  )

  const dpsProfiles = useMemo(() => {
    const year = new Date().getFullYear()
    const relevant = activeProfileId
      ? profiles.filter((p) => p.id === activeProfileId)
      : profiles
    return relevant
      .map((p) => {
        const age = getAge(p.birth_year, year)
        const premium = getDpsAnnualPremium(age, year)
        return premium != null ? { name: p.name, age, annualPremium: premium } : null
      })
      .filter((d) => d != null)
  }, [profiles, activeProfileId])

  const currentItems = useMemo<CoverageGapItem[]>(() => {
    if (!coverageData) return []
    if (activeProfileId) {
      const profile = coverageData.profiles.find(
        (p) => p.profileId === activeProfileId,
      )
      return profile?.items ?? []
    }
    return coverageData.combined
  }, [coverageData, activeProfileId])

  const overallScore = useMemo(() => {
    if (!coverageData) return 0
    if (activeProfileId) {
      const profile = coverageData.profiles.find(
        (p) => p.profileId === activeProfileId,
      )
      return profile?.overallScore ?? 0
    }
    // Average score across profiles for combined
    if (coverageData.profiles.length === 0) return 0
    return Math.round(
      coverageData.profiles.reduce((s, p) => s + p.overallScore, 0) /
        coverageData.profiles.length,
    )
  }, [coverageData, activeProfileId])

  const radarSeries = useMemo(() => {
    if (!coverageData) return []
    return buildRadarSeries(coverageData.profiles, activeProfileId)
  }, [coverageData, activeProfileId])

  const hasNoIncome = useMemo(() => {
    if (!coverageData) return false
    if (activeProfileId) {
      const profile = coverageData.profiles.find(
        (p) => p.profileId === activeProfileId,
      )
      return profile ? profile.annualSalary === 0 : true
    }
    return coverageData.profiles.every((p) => p.annualSalary === 0)
  }, [coverageData, activeProfileId])

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Insurance"
        description="Coverage analysis, gap detection, and premium tracking."
      />

      {isLoading ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard label="" value={0} loading />
            <MetricCard label="" value={0} loading />
            <MetricCard label="" value={0} loading />
            <MetricCard label="" value={0} loading />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </>
      ) : policies.length === 0 && !coverageData ? (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
          No insurance policies found for this profile.
        </div>
      ) : (
        <Tabs defaultValue={defaultTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="coverage">Coverage</TabsTrigger>
            <TabsTrigger value="policies">Policies</TabsTrigger>
            <TabsTrigger value="premiums">Premiums</TabsTrigger>
          </TabsList>

          {/* ── Overview Tab ── */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <MetricCard
                label="Annual Premiums"
                value={totalAnnualPremium}
                prefix="$"
                tooltipId="INSURANCE_DEDUCT"
              />
              <MetricCard
                label="Total Coverage"
                value={totalCoverage}
                prefix="$"
              />
              <MetricCard
                label="Active Policies"
                value={`${activePolicies.length} of ${policies.length}`}
              />
              <MetricCard
                label="Coverage Score"
                value={overallScore}
                suffix="/100"
                tooltipId="INSURANCE_COVERAGE_SCORE"
              />
            </div>

            {hasNoIncome && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
                Add income in Settings to see coverage benchmarks based on
                salary.
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Radar chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Coverage Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {radarSeries.length > 0 ? (
                    <RadarChart series={radarSeries} axes={RADAR_AXES} />
                  ) : (
                    <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
                      No coverage data available.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick status */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Coverage Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {currentItems.map((item) => {
                      const covered =
                        item.coverageType === "personal_accident"
                          ? item.hasCoverage
                          : item.gapPct === 0

                      return (
                        <div
                          key={item.coverageType}
                          className="flex items-center justify-between rounded-lg border px-4 py-3"
                        >
                          <div className="flex items-center gap-3">
                            {covered ? (
                              <div className="flex size-7 items-center justify-center rounded-full bg-green-600/20">
                                <Check className="size-4 text-green-600" />
                              </div>
                            ) : (
                              <div className="flex size-7 items-center justify-center rounded-full bg-destructive/20">
                                <X className="size-4 text-destructive" />
                              </div>
                            )}
                            <span className="text-sm font-medium">
                              {item.label}
                            </span>
                          </div>
                          <span className="text-sm tabular-nums text-muted-foreground">
                            {item.coverageType === "hospitalization"
                              ? item.hasCoverage
                                ? "Active ISP"
                                : "No ISP"
                              : item.coverageType === "personal_accident"
                                ? item.hasCoverage
                                  ? `$${formatCurrency(item.held)}`
                                  : "None"
                                : item.needed > 0
                                  ? `${Math.round(Math.min(item.held / item.needed, 1) * 100)}%`
                                  : "—"}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Coverage Tab ── */}
          <TabsContent value="coverage" className="space-y-6">
            {hasNoIncome && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
                Add income in Settings to see coverage benchmarks based on
                salary.
              </div>
            )}

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      Coverage Gap Analysis
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      How your coverage compares to LIA Singapore benchmarks.
                      Click a row for details.
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center rounded-lg border p-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-7 gap-1 px-2 text-xs ${!showDollars ? "bg-accent" : ""}`}
                      onClick={() => setShowDollars(false)}
                    >
                      <Percent className="size-3" />
                      <span className="hidden sm:inline">Percent</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-7 gap-1 px-2 text-xs ${showDollars ? "bg-accent" : ""}`}
                      onClick={() => setShowDollars(true)}
                    >
                      <DollarSign className="size-3" />
                      <span className="hidden sm:inline">Dollars</span>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <GapBars items={currentItems} showDollars={showDollars} />
              </CardContent>
            </Card>

            {coverageData && (
              <CoverageTable
                profiles={
                  activeProfileId
                    ? coverageData.profiles.filter(
                        (p) => p.profileId === activeProfileId,
                      )
                    : coverageData.profiles
                }
                policies={policies.map((p) => ({
                  id: p.id,
                  name: p.name,
                  type: p.type,
                  coverage_type: p.coverage_type,
                  coverage_amount: p.coverage_amount,
                  is_active: p.is_active,
                  profile_id: p.profile_id,
                }))}
              />
            )}
          </TabsContent>

          {/* ── Policies Tab ── */}
          <TabsContent value="policies" className="space-y-4">
            {dpsProfiles.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Dependants&apos; Protection Scheme (DPS)
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p className="mb-2">
                    DPS provides a $70,000 death/TPD payout. Premiums are
                    deducted from CPF OA, not bank accounts.
                  </p>
                  <div className="space-y-1">
                    {dpsProfiles.map((d) => (
                      <div
                        key={d.name}
                        className="flex items-center justify-between"
                      >
                        <span>
                          {d.name} (age {d.age})
                        </span>
                        <span className="tabular-nums font-medium text-foreground">
                          ${formatCurrency(d.annualPremium)}/yr
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {policies.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
                No insurance policies found.
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-3 text-left font-medium">
                          Policy
                        </th>
                        <th className="px-4 py-3 text-left font-medium">
                          Type
                        </th>
                        <th className="px-4 py-3 text-left font-medium">
                          Coverage
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          Premium
                        </th>
                        <th className="px-4 py-3 text-left font-medium">
                          Freq
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          Coverage Amt
                        </th>
                        <th className="px-4 py-3 text-center font-medium">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {policies.map((policy) => (
                        <tr
                          key={policy.id}
                          className="border-b last:border-0"
                        >
                          <td className="px-4 py-3 font-medium">
                            {policy.name}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {policy.type.replace(/_/g, " ")}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {policy.coverage_type?.replace(/_/g, " ") ??
                              "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            ${formatCurrency(policy.premium_amount)}
                          </td>
                          <td className="px-4 py-3 capitalize text-muted-foreground">
                            {policy.frequency}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {policy.coverage_amount
                              ? `$${formatCurrency(policy.coverage_amount)}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge
                              variant={
                                policy.is_active ? "default" : "secondary"
                              }
                              className={
                                policy.is_active
                                  ? "bg-green-600/20 text-green-700 hover:bg-green-600/30 dark:text-green-400"
                                  : ""
                              }
                            >
                              {policy.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Premiums Tab ── */}
          <TabsContent value="premiums" className="space-y-4">
            <PremiumCalendar policies={policies} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
