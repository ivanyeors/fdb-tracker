"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CpfOverviewChart } from "@/components/dashboard/cpf/cpf-overview-chart"
import { CpfRetirementChart } from "@/components/dashboard/cpf/cpf-retirement-chart"
import { CpfHousingTab, type CpfHousingApiResponse } from "@/components/dashboard/cpf/cpf-housing-tab"
import { CpfLoansTab, type CpfLoanRow } from "@/components/dashboard/cpf/cpf-loans-tab"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MetricCard } from "@/components/dashboard/metric-card"
import { SectionHeader } from "@/components/dashboard/section-header"
import { formatCurrency } from "@/lib/utils"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { useCpfSimulator, type SimulatorSeedData } from "@/hooks/use-cpf-simulator"
import { CpfSimulatorPanel } from "@/components/dashboard/cpf/cpf-simulator-panel"
import { ChartSkeleton } from "@/components/loading"
import { Badge } from "@/components/ui/badge"
import { calculateRetirementGap, findBenchmarkAge } from "@/lib/calculations/cpf-retirement"

type CpfBalanceRow = { month: string; oa: number; sa: number; ma: number }

type ProjectionPoint = {
  year: number
  age: number
  oa: number
  sa: number
  ma: number
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
  housingOaDeduction?: { monthly: number; loanName: string; remainingMonths: number }[] | null
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

function OverviewTab({
  data,
  dps,
}: {
  data: CpfBalanceRow[]
  dps?: RetirementData["dps"]
}) {
  const latest = data[data.length - 1] || { oa: 0, sa: 0, ma: 0 }

  const chartData = useMemo(() => {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return [...data]
      .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime())
      .slice(-6)
      .map((d) => {
        const date = new Date(d.month)
        return {
          ...d,
          month: `${monthNames[date.getMonth()]} ${date.getFullYear()}`,
        }
      })
  }, [data])

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
              <CardTitle className="text-base">Dependants&apos; Protection (DPS)</CardTitle>
              <InfoTooltip id="CPF_DPS" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              ${formatCurrency(dps.estimatedAnnualPremium)}
              <span className="text-sm font-normal text-muted-foreground">/yr (est., OA projection)</span>
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

      <Card>
        <CardHeader>
          <CardTitle>Monthly Contribution Projections (6 Months)</CardTitle>
        </CardHeader>
        <CardContent>
          <CpfOverviewChart data={chartData} />
        </CardContent>
      </Card>
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
    const projectedTotal = at55?.total ?? projection[projection.length - 1]?.total ?? 0

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

    return { projectedTotal, brsGap, frsGap, ersGap, brsAge, frsAge, ersAge, tier }
  }, [projection, retirementSums])

  const tierLabels = {
    below_brs: { label: "Below BRS", variant: "destructive" as const },
    brs: { label: "On track for BRS", variant: "outline" as const },
    frs: { label: "On track for FRS", variant: "secondary" as const },
    ers: { label: "On track for ERS", variant: "default" as const },
  }

  const tiers = [
    { key: "brs", label: "Basic (BRS)", target: retirementSums.brs, gap: analysis.brsGap, reachAge: analysis.brsAge },
    { key: "frs", label: "Full (FRS)", target: retirementSums.frs, gap: analysis.frsGap, reachAge: analysis.frsAge },
    { key: "ers", label: "Enhanced (ERS)", target: retirementSums.ers, gap: analysis.ersGap, reachAge: analysis.ersAge },
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
          Projected CPF at age 55: <span className="font-semibold text-foreground">${formatCurrency(analysis.projectedTotal)}</span>
        </p>

        <div className="space-y-3">
          {tiers.map((t) => {
            const pct = Math.min((analysis.projectedTotal / t.target) * 100, 100)
            return (
              <div key={t.key}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium">{t.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    ${formatCurrency(t.target)}
                    {t.reachAge && t.reachAge > currentAge && !t.gap.onTrack && (
                      <span className="ml-1">· reach at {t.reachAge}</span>
                    )}
                    {t.gap.onTrack && t.reachAge && (
                      <span className="ml-1">· reached at {t.reachAge}</span>
                    )}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      t.gap.onTrack ? "bg-green-500" : pct >= 70 ? "bg-yellow-500" : "bg-red-500"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {!t.gap.onTrack && t.gap.gap > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Gap: ${formatCurrency(t.gap.gap)} ({Math.round(t.gap.gapPercentage)}% short)
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
  const retirementSums = data?.retirementSums ?? { brs: 0, frs: 0, ers: 0 }

  const chartReferenceLines = useMemo(() => [
    { value: retirementSums.brs, label: "Basic Retirement Sum", shortLabel: "BRS", color: "oklch(0.72 0.12 160)" },
    { value: retirementSums.frs, label: "Full Retirement Sum", shortLabel: "FRS", color: "oklch(0.72 0.12 230)" },
    { value: retirementSums.ers, label: "Enhanced Retirement Sum", shortLabel: "ERS", color: "oklch(0.72 0.12 300)" },
  ], [retirementSums])

  const dps = data?.dps
  const housing = data?.housingOaDeduction
  const totalMonthlyHousing = data?.totalMonthlyHousingDeduction

  const simulatorSeed: SimulatorSeedData | null = useMemo(() => {
    if (!data || !data.extendedProjection || data.extendedProjection.length === 0) return null
    return {
      currentCpf: { oa: data.currentCpf.oa, sa: data.currentCpf.sa, ma: data.currentCpf.ma },
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
              <CardTitle className="text-base">DPS (est. annual premium)</CardTitle>
              <InfoTooltip id="CPF_DPS" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              ${formatCurrency(dps.estimatedAnnualPremium)}
              <span className="text-sm font-normal text-muted-foreground">/yr from OA projection</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{dps.note}</p>
          </CardContent>
        </Card>
      )}

      {dps && !dps.included && (
        <p className="text-sm text-muted-foreground">
          DPS deduction is off for this profile (User Settings). Enable &quot;Include DPS in CPF
          projection&quot; to model OA premiums.
        </p>
      )}

      {housing && housing.length > 0 && totalMonthlyHousing != null && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base">HDB Loan (CPF OA deduction)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              ${formatCurrency(totalMonthlyHousing)}
              <span className="text-sm font-normal text-muted-foreground">/mo from OA</span>
            </p>
            <div className="mt-1 space-y-0.5">
              {housing.map((h) => (
                <p key={h.loanName} className="text-xs text-muted-foreground">
                  {h.loanName} — ${formatCurrency(h.monthly)}/mo · {Math.ceil(h.remainingMonths / 12)}y remaining
                </p>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              The dashed line on the chart shows your projection without this loan deduction.
            </p>
          </CardContent>
        </Card>
      )}

      {simulator && (
        <CpfSimulatorPanel simulator={simulator} />
      )}

      {data?.extendedProjection && data.extendedProjection.length > 0 && (
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
          {!data?.extendedProjection || data.extendedProjection.length === 0 ? (
            <div className="flex h-[400px] items-center justify-center text-muted-foreground text-sm">
              No projection data. Add income in Settings to see projections.
            </div>
          ) : (
            <CpfRetirementChart
              data={data.extendedProjection}
              referenceLines={chartReferenceLines}
              comparisonData={data.projectionWithoutHousing}
              simulatedData={simulator?.isModified ? simulator.simulatedProjection : null}
              isSimulating={simulator?.isModified ?? false}
              currentAge={data.currentAge}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

const CPF_TAB_SET = new Set(["overview", "housing", "loans", "retirement"])

export default function CpfPage() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const defaultTab = tabParam && CPF_TAB_SET.has(tabParam) ? tabParam : "overview"

  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [cpfData, setCpfData] = useState<CpfBalanceRow[]>([])
  const [retirementData, setRetirementData] = useState<RetirementData | null>(null)
  const [housingData, setHousingData] = useState<CpfHousingApiResponse | null>(null)
  const [loansData, setLoansData] = useState<CpfLoanRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [housingLoading, setHousingLoading] = useState(false)

  const qsBase = useMemo(() => {
    const params = new URLSearchParams()
    if (activeProfileId) params.set("profileId", activeProfileId)
    else if (activeFamilyId) params.set("familyId", activeFamilyId)
    return params.toString()
  }, [activeProfileId, activeFamilyId])

  const refreshHousing = useCallback(async () => {
    if (!qsBase) return
    setHousingLoading(true)
    try {
      const housingRes = await fetch(`/api/cpf/housing?${qsBase}`)
      if (housingRes.ok) {
        const json = (await housingRes.json()) as CpfHousingApiResponse
        setHousingData(json)
      }
    } finally {
      setHousingLoading(false)
    }
  }, [qsBase])

  useEffect(() => {
    async function fetchAll() {
      if (!activeProfileId && !activeFamilyId) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const [balancesRes, retirementRes, housingRes, loansRes] = await Promise.all([
          fetch(`/api/cpf/balances?${qsBase}`),
          fetch(`/api/cpf/retirement?${qsBase}`),
          fetch(`/api/cpf/housing?${qsBase}`),
          fetch(`/api/loans?${qsBase}`),
        ])

        if (balancesRes.ok) {
          const json = await balancesRes.json()
          setCpfData(json || [])
        }
        if (retirementRes.ok) {
          const json = await retirementRes.json()
          setRetirementData(json)
        }
        if (housingRes.ok) {
          const json = (await housingRes.json()) as CpfHousingApiResponse
          setHousingData(json)
        }
        if (loansRes.ok) {
          const json = await loansRes.json()
          setLoansData(json ?? [])
        }
      } catch (error) {
        console.error("Failed to fetch CPF data:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchAll()
  }, [activeProfileId, activeFamilyId, qsBase])

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="CPF"
        description="OA/SA/MA, CPF housing usage, loans, retirement benchmarking."
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
              <CardTitle>Monthly Contribution Projections (6 Months)</CardTitle>
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
              <TabsTrigger value="loans">Loans</TabsTrigger>
              <TabsTrigger value="retirement">Retirement</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab data={cpfData} dps={retirementData?.dps} />
          </TabsContent>
          <TabsContent value="housing" className="mt-4">
            <CpfHousingTab
              data={housingData}
              isLoading={housingLoading}
              onRefresh={refreshHousing}
            />
          </TabsContent>
          <TabsContent value="loans" className="mt-4">
            <CpfLoansTab loans={loansData} />
          </TabsContent>
          <TabsContent value="retirement" className="mt-4">
            <RetirementTab
              data={retirementData}
              isFamilyView={!activeProfileId}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
