"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import { Check, X, DollarSign, Percent, ChevronDown, ShieldCheck, FileText } from "lucide-react"
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

const RadarChart = dynamic(
  () =>
    import("@/components/dashboard/insurance/radar-chart").then(
      (m) => m.RadarChart
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[300px] w-full rounded-xl" />,
  }
)
import { GapBars } from "@/components/dashboard/insurance/gap-bars"
import { CoverageTable } from "@/components/dashboard/insurance/coverage-table"
import { PremiumCalendar } from "@/components/dashboard/insurance/premium-calendar"
import { INSURANCE_TYPE_LABELS, COVERAGE_TYPE_LABELS } from "@/lib/insurance/coverage-config"
import type { InsuranceType, CoverageType } from "@/lib/insurance/coverage-config"
import {
  getCoverageRecommendation,
  type HouseholdCoverageAnalysis,
  type ProfileCoverageAnalysis,
  type CoverageGapItem,
} from "@/lib/calculations/insurance"

interface PolicyCoverage {
  id: string
  coverage_type: string | null
  coverage_amount: number
  benefit_name: string | null
  benefit_premium: number | null
  renewal_bonus: number | null
  benefit_expiry_date: string | null
  benefit_unit: string | null
  sort_order: number
}

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
  insurer: string | null
  sub_type: string | null
  rider_name: string | null
  rider_premium: number | null
  policy_number: string | null
  maturity_value: number | null
  cash_value: number | null
  coverage_till_age: number | null
  end_date: string | null
  current_amount: number | null
  inception_date: string | null
  cpf_premium: number | null
  premium_waiver: boolean
  remarks: string | null
  coverages: PolicyCoverage[]
}

const TAB_SET = new Set(["overview", "coverage", "policies"])

const RADAR_AXES = [
  "Death/TPD",
  "Critical Illness",
  "Hospitalization",
  "Disability/Income",
  "Long-term Care",
]
/** Each axis maps to one or more coverage types; grouped axes average their values. */
const RADAR_AXIS_TYPES: string[][] = [
  ["death", "tpd"],
  ["critical_illness", "early_critical_illness"],
  ["hospitalization", "medical_reimbursement"],
  ["disability"],
  ["long_term_care"],
]
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
    data: RADAR_AXIS_TYPES.map((types, idx) => {
      const values = types
        .map((ct) => profile.items.find((it) => it.coverageType === ct))
        .filter((it): it is CoverageGapItem => it != null)
        .map(radarValueFromItem)
      const avg =
        values.length > 0
          ? values.reduce((s, v) => s + v, 0) / values.length
          : 0
      return {
        axis: RADAR_AXES[idx],
        value: avg,
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
  const [expandedPolicies, setExpandedPolicies] = useState<Set<string>>(new Set())

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

  const { totalAnnualPremium, totalAnnualCpfPremium } = useMemo(() => {
    let total = 0
    let cpf = 0
    for (const p of activePolicies) {
      const annual =
        p.frequency === "monthly" ? p.premium_amount * 12 : p.premium_amount
      total += annual
      cpf += p.cpf_premium ?? 0
    }
    return { totalAnnualPremium: total, totalAnnualCpfPremium: cpf }
  }, [activePolicies])

  const totalAnnualCashPremium = totalAnnualPremium - totalAnnualCpfPremium

  const totalCoverage = useMemo(
    () =>
      activePolicies.reduce((sum, p) => {
        if (p.coverages && p.coverages.length > 0) {
          return sum + p.coverages.reduce((cs, c) => cs + c.coverage_amount, 0)
        }
        return sum + (p.coverage_amount || 0)
      }, 0),
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

  const activeAnalysis = useMemo(() => {
    if (!coverageData) return null
    if (activeProfileId) {
      return (
        coverageData.profiles.find((p) => p.profileId === activeProfileId) ??
        null
      )
    }
    return coverageData.profiles[0] ?? null
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
          </TabsList>

          {/* ── Overview Tab ── */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <MetricCard
                label="Annual Premiums (Cash)"
                value={totalAnnualCashPremium}
                prefix="$"
                tooltipId="INSURANCE_DEDUCT"
                subtitle={totalAnnualCpfPremium > 0 ? `+$${formatCurrency(totalAnnualCpfPremium)} CPF` : undefined}
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
                    <div className="flex h-[440px] items-center justify-center text-sm text-muted-foreground">
                      No coverage data available.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick status */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      Coverage Status
                    </CardTitle>
                    {activeAnalysis?.lifeStageLabel && (
                      <Badge variant="outline" className="text-xs font-normal">
                        {activeAnalysis.lifeStageLabel}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {currentItems.map((item) => {
                      const covered =
                        item.coverageType === "personal_accident"
                          ? item.hasCoverage
                          : item.gapPct === 0
                      const pct =
                        item.needed > 0
                          ? Math.round(
                              Math.min(item.held / item.needed, 1) * 100,
                            )
                          : null
                      const recommendation = getCoverageRecommendation(item)

                      return (
                        <div
                          key={item.coverageType}
                          className="rounded-lg border px-4 py-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {covered ? (
                                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-green-600/20">
                                  <Check className="size-4 text-green-600" />
                                </div>
                              ) : (
                                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive/20">
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
                                  : pct != null
                                    ? `${pct}%`
                                    : "—"}
                            </span>
                          </div>
                          {item.coverageType !== "hospitalization" &&
                            item.coverageType !== "personal_accident" &&
                            item.coverageType !== "medical_reimbursement" &&
                            item.coverageType !== "accident_death_tpd" &&
                            item.needed > 0 && (
                              <div className="mt-1.5 pl-10">
                                <div className="text-xs tabular-nums text-muted-foreground">
                                  ${formatCurrency(item.held)} of $
                                  {formatCurrency(item.needed)} needed
                                </div>
                                {recommendation && (
                                  <div className="mt-1 text-xs text-muted-foreground/70">
                                    {recommendation}
                                  </div>
                                )}
                              </div>
                            )}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Premium Schedule</CardTitle>
              </CardHeader>
              <CardContent>
                <PremiumCalendar policies={policies} />
              </CardContent>
            </Card>
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
                  coverages: p.coverages ?? [],
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
                          Insurer
                        </th>
                        <th className="px-4 py-3 text-left font-medium">
                          Type
                        </th>
                        <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">
                          Policy #
                        </th>
                        <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">
                          Inception
                        </th>
                        <th className="px-4 py-3 text-left font-medium">
                          Coverages
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          Premium
                        </th>
                        <th className="px-4 py-3 text-left font-medium">
                          Freq
                        </th>
                        <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">
                          Term
                        </th>
                        <th className="hidden px-4 py-3 text-right font-medium lg:table-cell">
                          Cash Value
                        </th>
                        <th className="px-4 py-3 text-center font-medium">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {policies.map((policy) => {
                        const isExpanded = expandedPolicies.has(policy.id)
                        const customBenefits = policy.coverages.filter((c) => !c.coverage_type)
                        const hasExpandableContent = policy.remarks || policy.premium_waiver || customBenefits.length > 0 || policy.coverages.some((c) => c.benefit_premium != null || c.renewal_bonus != null)
                        return (
                          <React.Fragment key={policy.id}>
                            <tr
                              className={`border-b last:border-0 ${hasExpandableContent ? "cursor-pointer hover:bg-muted/30" : ""}`}
                              onClick={() => {
                                if (!hasExpandableContent) return
                                setExpandedPolicies((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(policy.id)) next.delete(policy.id)
                                  else next.add(policy.id)
                                  return next
                                })
                              }}
                            >
                              <td className="px-4 py-3 font-medium">
                                <div className="flex items-center gap-1.5">
                                  {policy.name}
                                  {hasExpandableContent && (
                                    <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {policy.insurer ?? "—"}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {INSURANCE_TYPE_LABELS[
                                  policy.type as InsuranceType
                                ] ?? policy.type.replace(/_/g, " ")}
                              </td>
                              <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                                {policy.policy_number ?? "—"}
                              </td>
                              <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                                {policy.inception_date
                                  ? new Intl.DateTimeFormat("en-SG", { month: "short", year: "numeric" }).format(new Date(policy.inception_date))
                                  : "—"}
                              </td>
                              <td className="px-4 py-3">
                                {policy.coverages && policy.coverages.length > 0 ? (
                                  <div className="space-y-1">
                                    {policy.coverages
                                      .filter((c) => c.coverage_type)
                                      .map((c, i) => (
                                      <div key={c.id || `${c.coverage_type}-${i}`} className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-[10px] shrink-0">
                                          {COVERAGE_TYPE_LABELS[c.coverage_type as CoverageType] ?? c.coverage_type!.replace(/_/g, " ")}
                                        </Badge>
                                        <span className="text-xs tabular-nums text-muted-foreground">
                                          {c.coverage_amount > 0 ? `$${formatCurrency(c.coverage_amount)}` : "—"}
                                        </span>
                                      </div>
                                    ))}
                                    {customBenefits.length > 0 && (
                                      <span className="text-[10px] text-muted-foreground">
                                        +{customBenefits.length} benefit{customBenefits.length > 1 ? "s" : ""}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">
                                    {policy.coverage_type?.replace(/_/g, " ") ?? "—"}
                                    {policy.coverage_amount ? ` ($${formatCurrency(policy.coverage_amount)})` : ""}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">
                                ${formatCurrency(policy.premium_amount)}
                                {policy.rider_premium != null &&
                                  policy.rider_premium > 0 && (
                                    <span className="block text-xs text-muted-foreground">
                                      +${formatCurrency(policy.rider_premium)}{" "}
                                      rider
                                    </span>
                                  )}
                                {policy.cpf_premium != null &&
                                  policy.cpf_premium > 0 && (
                                    <span className="block text-xs text-blue-600 dark:text-blue-400">
                                      ${formatCurrency(policy.cpf_premium)}/yr CPF
                                    </span>
                                  )}
                              </td>
                              <td className="px-4 py-3 capitalize text-muted-foreground">
                                {policy.frequency}
                              </td>
                              <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                                {policy.coverage_till_age
                                  ? `Till age ${policy.coverage_till_age}`
                                  : "—"}
                              </td>
                              <td className="hidden px-4 py-3 text-right tabular-nums text-muted-foreground lg:table-cell">
                                {policy.cash_value != null && policy.cash_value > 0
                                  ? `$${formatCurrency(policy.cash_value)}`
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
                            {isExpanded && (
                              <tr className="border-b last:border-0 bg-muted/20">
                                <td colSpan={11} className="px-6 py-3">
                                  <div className="space-y-3 text-xs text-muted-foreground">
                                    <div className="flex flex-wrap items-start gap-4">
                                      {policy.premium_waiver && (
                                        <div className="flex items-center gap-1">
                                          <ShieldCheck className="size-3.5 text-green-600" />
                                          <span className="font-medium text-green-700 dark:text-green-400">Premium Waiver</span>
                                        </div>
                                      )}
                                      {policy.remarks && (
                                        <div className="flex items-start gap-1">
                                          <FileText className="mt-0.5 size-3.5 shrink-0" />
                                          <span className="whitespace-pre-wrap">{policy.remarks}</span>
                                        </div>
                                      )}
                                    </div>
                                    {policy.coverages.some((c) => c.benefit_name) && (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="border-b text-muted-foreground/70">
                                              <th className="py-1.5 pr-4 text-left font-medium">Benefit</th>
                                              <th className="py-1.5 pr-4 text-right font-medium">Coverage</th>
                                              <th className="py-1.5 pr-4 text-right font-medium">Premium</th>
                                              <th className="py-1.5 pr-4 text-right font-medium">Renewal Bonus</th>
                                              <th className="py-1.5 text-left font-medium">Expiry</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {[...policy.coverages]
                                              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                                              .map((c, i) => (
                                              <tr key={c.id || i} className="border-b border-dashed last:border-0">
                                                <td className="py-1.5 pr-4">
                                                  {c.benefit_name ?? (c.coverage_type ? COVERAGE_TYPE_LABELS[c.coverage_type as CoverageType] ?? c.coverage_type : "—")}
                                                  {c.benefit_unit && <span className="ml-1 text-muted-foreground/60">{c.benefit_unit}</span>}
                                                </td>
                                                <td className="py-1.5 pr-4 text-right tabular-nums">
                                                  {c.coverage_amount > 0 ? `$${formatCurrency(c.coverage_amount)}` : "—"}
                                                </td>
                                                <td className="py-1.5 pr-4 text-right tabular-nums">
                                                  {c.benefit_premium != null ? `$${formatCurrency(c.benefit_premium)}` : "—"}
                                                </td>
                                                <td className="py-1.5 pr-4 text-right tabular-nums">
                                                  {c.renewal_bonus != null && c.renewal_bonus > 0 ? `$${formatCurrency(c.renewal_bonus)}` : "—"}
                                                </td>
                                                <td className="py-1.5">
                                                  {c.benefit_expiry_date
                                                    ? new Intl.DateTimeFormat("en-SG", { month: "short", year: "numeric" }).format(new Date(c.benefit_expiry_date))
                                                    : "—"}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/50 font-medium">
                        <td className="px-4 py-3" colSpan={5}>
                          Total ({activePolicies.length} active)
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs tabular-nums">
                            ${formatCurrency(totalCoverage)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          ${formatCurrency(totalAnnualCashPremium)}/yr
                          {totalAnnualCpfPremium > 0 && (
                            <span className="block text-xs font-normal text-blue-600 dark:text-blue-400">
                              +${formatCurrency(totalAnnualCpfPremium)} CPF
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3" colSpan={2}></td>
                        <td className="hidden px-4 py-3 text-right tabular-nums lg:table-cell">
                          {(() => {
                            const totalCash = activePolicies.reduce((s, p) => s + (p.cash_value ?? 0), 0)
                            return totalCash > 0 ? `$${formatCurrency(totalCash)}` : "—"
                          })()}
                        </td>
                        <td className="px-4 py-3"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>

        </Tabs>
      )}
    </div>
  )
}
