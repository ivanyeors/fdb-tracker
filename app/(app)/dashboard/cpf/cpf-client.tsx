"use client"

import { useMemo, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  CpfHousingTab,
  type CpfHousingApiResponse,
} from "@/components/dashboard/cpf/cpf-housing-tab"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MetricCard } from "@/components/dashboard/metric-card"
import { SectionHeader } from "@/components/dashboard/section-header"
import { formatCurrency } from "@/lib/utils"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { useActiveProfile } from "@/hooks/use-active-profile"
import {
  useCpfSimulator,
  type SimulatorSeedData,
} from "@/hooks/use-cpf-simulator"
import { CpfSimulatorPanel } from "@/components/dashboard/cpf/cpf-simulator-panel"
import { ChartSkeleton } from "@/components/loading"
import { Badge } from "@/components/ui/badge"
import {
  calculateRetirementGap,
  findBenchmarkAge,
} from "@/lib/calculations/cpf-retirement"
import { useApi } from "@/hooks/use-api"

const CpfOverviewChart = dynamic(
  () =>
    import("@/components/dashboard/cpf/cpf-overview-chart").then(
      (m) => m.CpfOverviewChart
    ),
  { ssr: false, loading: () => <ChartSkeleton className="h-[300px]" /> }
)

const CpfTrendChart = dynamic(
  () =>
    import("@/components/dashboard/cpf/cpf-trend-chart").then(
      (m) => m.CpfTrendChart
    ),
  { ssr: false, loading: () => <ChartSkeleton className="h-[280px]" /> }
)

const CpfRetirementChart = dynamic(
  () =>
    import("@/components/dashboard/cpf/cpf-retirement-chart").then(
      (m) => m.CpfRetirementChart
    ),
  { ssr: false, loading: () => <ChartSkeleton className="h-[350px]" /> }
)

type CpfBalanceRow = { month: string; oa: number; sa: number; ma: number }

type ProjectionPoint = {
  year: number
  age: number
  oa: number
  sa: number
  ma: number
  total: number
}

type HealthcareBreakdown = {
  msl: number
  csl: number
  sup: number
  pmi: number
  total: number
}

type RetirementData = {
  currentCpf: { oa: number; sa: number; ma: number; total: number }
  currentAge: number
  birthYear: number
  retirementSums: { brs: number; frs: number; ers: number }
  extendedProjection: ProjectionPoint[]
  projectionWithoutHousing?: ProjectionPoint[] | null
  profileName?: string | null
  dps?: {
    included: boolean
    estimatedAnnualPremium: number | null
    note: string
  }
  healthcare?: {
    breakdown: HealthcareBreakdown
    monthlyMaDeduction: number
    note: string
  }
  interest?: {
    breakdown: {
      oaBase: number
      saBase: number
      maBase: number
      extraInterest: number
      total: number
    }
    note: string
  }
  housingOaDeduction?: {
    monthly: number
    loanName: string
    remainingMonths: number
  }[]  | null
  totalMonthlyHousingDeduction?: number | null
  annualSalary?: number
  incomeGrowthRate?: number
  loans?: Array<{
    name: string
    principal: number
    ratePct: number
    tenureMonths: number
    monthlyPayment: number
    remainingMonths: number
    useCpfOa: boolean
  }>
}

export type CpfInitialData = {
  balances: CpfBalanceRow[]
  retirement: RetirementData | null
  housing: CpfHousingApiResponse | null
}

function buildApiUrl(
  path: string,
  profileId: string | null,
  familyId: string | null
): string | null {
  if (!profileId && !familyId) return null
  const url = new URL(path, "http://localhost")
  if (profileId) url.searchParams.set("profileId", profileId)
  else if (familyId) url.searchParams.set("familyId", familyId)
  return `${url.pathname}${url.search}`
}

function OverviewTab({
  data,
  dps,
  healthcare,
  interest,
}: {
  data: CpfBalanceRow[]
  dps?: RetirementData["dps"]
  healthcare?: RetirementData["healthcare"]
  interest?: RetirementData["interest"]
}) {
  const latest = data.at(-1)! || { oa: 0, sa: 0, ma: 0 }

  const sortedData = useMemo(
    () =>
      [...data].sort(
        (a, b) => new Date(a.month).getTime() - new Date(b.month).getTime(),
      ),
    [data],
  )

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
    return sortedData.slice(-6).map((d) => {
      const date = new Date(d.month)
      return {
        ...d,
        month: `${monthNames[date.getMonth()]} ${date.getFullYear()}`,
      }
    })
  }, [sortedData])

  const trendData = useMemo(() => {
    if (sortedData.length < 2) return []
    const rows = sortedData.slice(-13) // 13 rows = 12 month-on-month deltas
    const result: Array<{
      month: string
      inflow: number
      inflowOa: number
      inflowSa: number
      inflowMa: number
      outflow: number
    }> = []

    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]
      const curr = rows[i]
      const dOa = curr.oa - prev.oa
      const dSa = curr.sa - prev.sa
      const dMa = curr.ma - prev.ma

      // Positive deltas = inflow (contributions + interest)
      // Negative deltas = outflow (housing deductions, etc.)
      const inflowOa = Math.max(0, dOa)
      const inflowSa = Math.max(0, dSa)
      const inflowMa = Math.max(0, dMa)
      const outflowOa = Math.abs(Math.min(0, dOa))
      const outflowSa = Math.abs(Math.min(0, dSa))
      const outflowMa = Math.abs(Math.min(0, dMa))

      result.push({
        month: curr.month,
        inflow: inflowOa + inflowSa + inflowMa,
        inflowOa,
        inflowSa,
        inflowMa,
        outflow: outflowOa + outflowSa + outflowMa,
      })
    }
    return result
  }, [sortedData])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          label="Ordinary Account (OA)"
          value={latest.oa}
          prefix="$"
          tooltipId="CPF_OA_SA_MA"
        />
        <MetricCard
          label="Special Account (SA)"
          value={latest.sa}
          prefix="$"
          tooltipId="CPF_OA_SA_MA"
        />
        <MetricCard
          label="Medisave Account (MA)"
          value={latest.ma}
          prefix="$"
          tooltipId="CPF_OA_SA_MA"
        />
      </div>

      {dps?.included && dps.estimatedAnnualPremium != null && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-base">
                Dependants&apos; Protection (DPS)
              </CardTitle>
              <InfoTooltip id="CPF_DPS" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              ${formatCurrency(dps.estimatedAnnualPremium)}
              <span className="text-sm font-normal text-muted-foreground">
                /yr (est., OA projection)
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{dps.note}</p>
          </CardContent>
        </Card>
      )}

      {dps && !dps.included && (
        <p className="text-sm text-muted-foreground">
          DPS is excluded from projections for this profile (User Settings).
        </p>
      )}

      {healthcare && healthcare.breakdown.total > 0 && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base">
              Healthcare (MA Deductions)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              ${formatCurrency(healthcare.breakdown.total)}
              <span className="text-sm font-normal text-muted-foreground">
                /yr from MediSave
              </span>
            </p>
            <div className="mt-2 space-y-0.5">
              {healthcare.breakdown.msl > 0 && (
                <p className="text-xs text-muted-foreground">
                  MediShield Life — ${formatCurrency(healthcare.breakdown.msl)}/yr
                </p>
              )}
              {healthcare.breakdown.csl > 0 && (
                <p className="text-xs text-muted-foreground">
                  CareShield Life — ${formatCurrency(healthcare.breakdown.csl)}/yr
                </p>
              )}
              {healthcare.breakdown.sup > 0 && (
                <p className="text-xs text-muted-foreground">
                  CareShield Life Supplement — ${formatCurrency(healthcare.breakdown.sup)}/yr
                </p>
              )}
              {healthcare.breakdown.pmi > 0 && (
                <p className="text-xs text-muted-foreground">
                  Integrated Shield Plan — ${formatCurrency(healthcare.breakdown.pmi)}/yr
                </p>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {healthcare.note}
            </p>
          </CardContent>
        </Card>
      )}

      {interest && interest.breakdown.total > 0 && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base">
              Government (Interest Earned)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              ~${formatCurrency(interest.breakdown.total)}
              <span className="text-sm font-normal text-muted-foreground">
                /yr (est.)
              </span>
            </p>
            <div className="mt-2 space-y-0.5">
              <p className="text-xs text-muted-foreground">
                OA base interest — ${formatCurrency(interest.breakdown.oaBase)}
              </p>
              <p className="text-xs text-muted-foreground">
                SA base interest — ${formatCurrency(interest.breakdown.saBase)}
              </p>
              <p className="text-xs text-muted-foreground">
                MA base interest — ${formatCurrency(interest.breakdown.maBase)}
              </p>
              {interest.breakdown.extraInterest > 0 && (
                <p className="text-xs text-muted-foreground">
                  Extra interest — ${formatCurrency(interest.breakdown.extraInterest)}
                </p>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {interest.note}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Contribution Breakdown (6 Months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CpfOverviewChart data={chartData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Monthly Inflow vs Outflow
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 ? (
              <CpfTrendChart data={trendData} />
            ) : (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                Need at least 2 months of balance data to show trends.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function RetirementReadinessCard({
  projection,
  retirementSums,
  currentAge,
}: {
  projection: ProjectionPoint[]
  retirementSums: { brs: number; frs: number; ers: number }
  currentAge: number
}) {
  const analysis = useMemo(() => {
    const at55 = projection.find((p) => p.age === 55)
    const projectedTotal =
      at55?.total ?? projection.at(-1)!.total ?? 0

    const brsGap = calculateRetirementGap(projectedTotal, retirementSums.brs)
    const frsGap = calculateRetirementGap(projectedTotal, retirementSums.frs)
    const ersGap = calculateRetirementGap(projectedTotal, retirementSums.ers)

    const brsAge = findBenchmarkAge(projection, retirementSums.brs)
    const frsAge = findBenchmarkAge(projection, retirementSums.frs)
    const ersAge = findBenchmarkAge(projection, retirementSums.ers)

    let tier: "below_brs" | "brs" | "frs" | "ers"
    if (ersGap.onTrack) tier = "ers"
    else if (frsGap.onTrack) tier = "frs"
    else if (brsGap.onTrack) tier = "brs"
    else tier = "below_brs"

    return {
      projectedTotal,
      brsGap,
      frsGap,
      ersGap,
      brsAge,
      frsAge,
      ersAge,
      tier,
    }
  }, [projection, retirementSums])

  const tierLabels = {
    below_brs: { label: "Below BRS", variant: "destructive" as const },
    brs: { label: "On track for BRS", variant: "outline" as const },
    frs: { label: "On track for FRS", variant: "secondary" as const },
    ers: { label: "On track for ERS", variant: "default" as const },
  }

  const tiers = [
    {
      key: "brs",
      label: "Basic (BRS)",
      target: retirementSums.brs,
      gap: analysis.brsGap,
      reachAge: analysis.brsAge,
    },
    {
      key: "frs",
      label: "Full (FRS)",
      target: retirementSums.frs,
      gap: analysis.frsGap,
      reachAge: analysis.frsAge,
    },
    {
      key: "ers",
      label: "Enhanced (ERS)",
      target: retirementSums.ers,
      gap: analysis.ersGap,
      reachAge: analysis.ersAge,
    },
  ]

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">Retirement Readiness</CardTitle>
        <Badge variant={tierLabels[analysis.tier].variant}>
          {tierLabels[analysis.tier].label}
        </Badge>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Projected CPF at age 55:{" "}
          <span className="font-semibold text-foreground">
            ${formatCurrency(analysis.projectedTotal)}
          </span>
        </p>

        <div className="space-y-3">
          {tiers.map((t) => {
            const pct = Math.min(
              (analysis.projectedTotal / t.target) * 100,
              100
            )
            return (
              <div key={t.key}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium">{t.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    ${formatCurrency(t.target)}
                    {t.reachAge &&
                      t.reachAge > currentAge &&
                      !t.gap.onTrack && (
                        <span className="ml-1">
                          · reach at {t.reachAge}
                        </span>
                      )}
                    {t.gap.onTrack && t.reachAge && (
                      <span className="ml-1">
                        · reached at {t.reachAge}
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      t.gap.onTrack
                        ? "bg-green-500"
                        : pct >= 70
                          ? "bg-yellow-500"
                          : "bg-red-500"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {!t.gap.onTrack && t.gap.gap > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Gap: ${formatCurrency(t.gap.gap)} (
                    {Math.round(t.gap.gapPercentage)}% short)
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function RetirementTab({
  data,
  isFamilyView,
}: {
  data: RetirementData | null
  isFamilyView: boolean
}) {
  const retirementSums = useMemo(
    () => data?.retirementSums ?? { brs: 0, frs: 0, ers: 0 },
    [data?.retirementSums]
  )

  const chartReferenceLines = useMemo(
    () => [
      {
        value: retirementSums.brs,
        label: "Basic Retirement Sum",
        shortLabel: "BRS",
        color: "oklch(0.72 0.12 160)",
      },
      {
        value: retirementSums.frs,
        label: "Full Retirement Sum",
        shortLabel: "FRS",
        color: "oklch(0.72 0.12 230)",
      },
      {
        value: retirementSums.ers,
        label: "Enhanced Retirement Sum",
        shortLabel: "ERS",
        color: "oklch(0.72 0.12 300)",
      },
    ],
    [retirementSums]
  )

  const dps = data?.dps
  const healthcare = data?.healthcare
  const housing = data?.housingOaDeduction
  const totalMonthlyHousing = data?.totalMonthlyHousingDeduction

  const simulatorSeed: SimulatorSeedData | null = useMemo(() => {
    if (
      !data ||
      !data.extendedProjection ||
      data.extendedProjection.length === 0
    )
      return null
    return {
      currentCpf: {
        oa: data.currentCpf.oa,
        sa: data.currentCpf.sa,
        ma: data.currentCpf.ma,
      },
      currentAge: data.currentAge,
      birthYear: data.birthYear,
      annualSalary: data.annualSalary ?? 0,
      incomeGrowthRate: data.incomeGrowthRate ?? 0.03,
      loans: (data.loans ?? []).filter((l) => l.useCpfOa),
      dpsIncluded: dps?.included ?? true,
      extendedProjection: data.extendedProjection,
    }
  }, [data, dps?.included])

  const simulator = useCpfSimulator(simulatorSeed)

  return (
    <div className="space-y-6">
      {isFamilyView && data?.profileName && (
        <p className="text-sm text-muted-foreground">
          Showing retirement for {data.profileName}
        </p>
      )}

      {dps && dps.included && dps.estimatedAnnualPremium != null && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-base">
                DPS (est. annual premium)
              </CardTitle>
              <InfoTooltip id="CPF_DPS" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              ${formatCurrency(dps.estimatedAnnualPremium)}
              <span className="text-sm font-normal text-muted-foreground">
                /yr from OA projection
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{dps.note}</p>
          </CardContent>
        </Card>
      )}

      {dps && !dps.included && (
        <p className="text-sm text-muted-foreground">
          DPS deduction is off for this profile (User Settings). Enable
          &quot;Include DPS in CPF projection&quot; to model OA premiums.
        </p>
      )}

      {housing && housing.length > 0 && totalMonthlyHousing != null && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base">
              HDB Loan (CPF OA deduction)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              ${formatCurrency(totalMonthlyHousing)}
              <span className="text-sm font-normal text-muted-foreground">
                /mo from OA
              </span>
            </p>
            <div className="mt-1 space-y-0.5">
              {housing.map((h) => (
                <p
                  key={h.loanName}
                  className="text-xs text-muted-foreground"
                >
                  {h.loanName} — ${formatCurrency(h.monthly)}/mo ·{" "}
                  {Math.ceil(h.remainingMonths / 12)}y remaining
                </p>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              The dashed line on the chart shows your projection without this
              loan deduction.
            </p>
          </CardContent>
        </Card>
      )}

      {healthcare && healthcare.breakdown.total > 0 && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base">
              Healthcare (MA deductions in projection)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              ${formatCurrency(healthcare.monthlyMaDeduction)}
              <span className="text-sm font-normal text-muted-foreground">
                /mo from MediSave
              </span>
            </p>
            <div className="mt-1 space-y-0.5">
              {healthcare.breakdown.msl > 0 && (
                <p className="text-xs text-muted-foreground">
                  MediShield Life — ${formatCurrency(healthcare.breakdown.msl)}/yr
                </p>
              )}
              {healthcare.breakdown.csl > 0 && (
                <p className="text-xs text-muted-foreground">
                  CareShield Life — ${formatCurrency(healthcare.breakdown.csl)}/yr
                </p>
              )}
              {healthcare.breakdown.sup > 0 && (
                <p className="text-xs text-muted-foreground">
                  CareShield Life Supplement — ${formatCurrency(healthcare.breakdown.sup)}/yr
                </p>
              )}
              {healthcare.breakdown.pmi > 0 && (
                <p className="text-xs text-muted-foreground">
                  Integrated Shield Plan — ${formatCurrency(healthcare.breakdown.pmi)}/yr
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {simulator && <CpfSimulatorPanel simulator={simulator} />}

      {data?.extendedProjection &&
        data.extendedProjection.length > 0 && (
          <RetirementReadinessCard
            projection={data.extendedProjection}
            retirementSums={retirementSums}
            currentAge={data.currentAge}
          />
        )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-1.5">
            <CardTitle>CPF Growth Projection</CardTitle>
            <InfoTooltip id="CPF_RETIREMENT_PROJECTION" />
          </div>
        </CardHeader>
        <CardContent>
          {!data?.extendedProjection ||
          data.extendedProjection.length === 0 ? (
            <div className="flex h-[400px] items-center justify-center text-muted-foreground text-sm">
              No projection data. Add income in Settings to see projections.
            </div>
          ) : (
            <CpfRetirementChart
              data={data.extendedProjection}
              referenceLines={chartReferenceLines}
              comparisonData={data.projectionWithoutHousing}
              simulatedData={
                simulator?.isModified
                  ? simulator.simulatedProjection
                  : null
              }
              isSimulating={simulator?.isModified ?? false}
              currentAge={data.currentAge}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

const CPF_TAB_SET = new Set(["overview", "housing", "retirement"])

export function CpfClient({
  initialData,
}: {
  initialData: CpfInitialData
}) {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const defaultTab =
    tabParam && CPF_TAB_SET.has(tabParam) ? tabParam : "overview"

  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const balancesUrl = buildApiUrl(
    "/api/cpf/balances",
    activeProfileId,
    activeFamilyId
  )
  const retirementUrl = buildApiUrl(
    "/api/cpf/retirement",
    activeProfileId,
    activeFamilyId
  )
  const housingUrl = buildApiUrl(
    "/api/cpf/housing",
    activeProfileId,
    activeFamilyId
  )
  const { data: cpfData, isLoading: balancesLoading } = useApi<
    CpfBalanceRow[]
  >(balancesUrl, { fallbackData: initialData.balances })

  const { data: retirementData } = useApi<RetirementData>(retirementUrl, {
      fallbackData: initialData.retirement ?? undefined,
    })

  const {
    data: housingData,
    isLoading: housingLoading,
    mutate: mutateHousing,
  } = useApi<CpfHousingApiResponse>(housingUrl, {
    fallbackData: initialData.housing ?? undefined,
  })

  const isLoading = balancesLoading && !cpfData

  const refreshHousing = useCallback(async () => {
    await mutateHousing()
  }, [mutateHousing])

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="CPF"
        description="OA/SA/MA balances, housing usage, and retirement benchmarking."
      />

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <MetricCard label="" value={0} loading />
            <MetricCard label="" value={0} loading />
            <MetricCard label="" value={0} loading />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>
                Monthly Contribution Projections (6 Months)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartSkeleton height={250} />
            </CardContent>
          </Card>
        </div>
      ) : (
        <Tabs key={defaultTab} defaultValue={defaultTab}>
          <div className="-mx-1 min-w-0 overflow-x-auto no-scrollbar [overscroll-behavior-x:contain] [-webkit-overflow-scrolling:touch]">
            <TabsList className="inline-flex w-fit flex-nowrap">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="housing">Housing</TabsTrigger>
              <TabsTrigger value="retirement">Retirement</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab
              data={cpfData ?? []}
              dps={retirementData?.dps}
              healthcare={retirementData?.healthcare}
              interest={retirementData?.interest}
            />
          </TabsContent>
          <TabsContent value="housing" className="mt-4">
            <CpfHousingTab
              data={housingData ?? null}
              isLoading={housingLoading && !housingData}
              onRefresh={refreshHousing}
              isFamilyView={!activeProfileId}
              housingDeductions={retirementData?.housingOaDeduction}
              totalMonthlyDeduction={retirementData?.totalMonthlyHousingDeduction}
            />
          </TabsContent>
          <TabsContent value="retirement" className="mt-4">
            <RetirementTab
              data={retirementData ?? null}
              isFamilyView={!activeProfileId}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
