"use client"

import { useState, useMemo, useCallback } from "react"
import {
  projectCpfGrowth,
  type CpfProjectionPoint,
} from "@/lib/calculations/cpf-retirement"
import { calculateCpfContribution } from "@/lib/calculations/cpf"
import { getDpsMonthlyOaDeduction } from "@/lib/calculations/cpf-dps"
import { loanMonthlyPayment } from "@/lib/calculations/loans"

export type SimulatorLoan = {
  name: string
  principal: number
  ratePct: number
  tenureMonths: number
  monthlyPayment: number
  remainingMonths: number
  enabled: boolean
}

export type HypotheticalLoan = {
  principal: number
  ratePct: number
  tenureMonths: number
}

export type SimulatorSeedData = {
  currentCpf: { oa: number; sa: number; ma: number }
  currentAge: number
  birthYear: number
  annualSalary: number
  incomeGrowthRate: number
  loans: Array<{
    name: string
    principal: number
    ratePct: number
    tenureMonths: number
    monthlyPayment: number
    remainingMonths: number
  }>
  dpsIncluded: boolean
  extendedProjection: CpfProjectionPoint[]
}

export type CpfSimulatorState = {
  annualSalary: number
  incomeGrowthRate: number
  loanOverrides: SimulatorLoan[]
  hypotheticalLoan: HypotheticalLoan | null
  additionalOaTopUp: number
  additionalSaTopUp: number
  includeDps: boolean
}

export type CpfSimulatorResult = {
  state: CpfSimulatorState
  setAnnualSalary: (v: number) => void
  setIncomeGrowthRate: (v: number) => void
  setLoanEnabled: (index: number, enabled: boolean) => void
  setLoanField: (
    index: number,
    field: "principal" | "ratePct" | "tenureMonths",
    value: number,
  ) => void
  setHypotheticalLoan: (loan: HypotheticalLoan | null) => void
  setAdditionalOaTopUp: (v: number) => void
  setAdditionalSaTopUp: (v: number) => void
  setIncludeDps: (v: boolean) => void
  reset: () => void
  simulatedProjection: CpfProjectionPoint[]
  baselineProjection: CpfProjectionPoint[]
  deltaAt55: number
  isModified: boolean
}

function buildInitialState(seed: SimulatorSeedData): CpfSimulatorState {
  return {
    annualSalary: seed.annualSalary,
    incomeGrowthRate: seed.incomeGrowthRate,
    loanOverrides: seed.loans.map((l) => ({
      name: l.name,
      principal: l.principal,
      ratePct: l.ratePct,
      tenureMonths: l.tenureMonths,
      monthlyPayment: l.monthlyPayment,
      remainingMonths: l.remainingMonths,
      enabled: true,
    })),
    hypotheticalLoan: null,
    additionalOaTopUp: 0,
    additionalSaTopUp: 0,
    includeDps: seed.dpsIncluded,
  }
}

export function useCpfSimulator(
  seed: SimulatorSeedData | null,
): CpfSimulatorResult | null {
  const [state, setState] = useState<CpfSimulatorState | null>(() =>
    seed ? buildInitialState(seed) : null,
  )
  const [prevSeed, setPrevSeed] = useState(seed)

  // Reseed when API data changes (sync during render)
  if (seed !== prevSeed) {
    setPrevSeed(seed)
    if (seed) {
      setState(buildInitialState(seed))
    }
  }

  const setAnnualSalary = useCallback(
    (v: number) => setState((s) => (s ? { ...s, annualSalary: v } : s)),
    [],
  )
  const setIncomeGrowthRate = useCallback(
    (v: number) => setState((s) => (s ? { ...s, incomeGrowthRate: v } : s)),
    [],
  )
  const setLoanEnabled = useCallback(
    (index: number, enabled: boolean) =>
      setState((s) => {
        if (!s) return s
        const loans = [...s.loanOverrides]
        if (loans[index]) loans[index] = { ...loans[index], enabled }
        return { ...s, loanOverrides: loans }
      }),
    [],
  )
  const setLoanField = useCallback(
    (
      index: number,
      field: "principal" | "ratePct" | "tenureMonths",
      value: number,
    ) =>
      setState((s) => {
        if (!s) return s
        const loans = [...s.loanOverrides]
        if (loans[index]) {
          const updated = { ...loans[index], [field]: value }
          updated.monthlyPayment =
            Math.round(
              loanMonthlyPayment(
                updated.principal,
                updated.ratePct,
                updated.tenureMonths,
              ) * 100,
            ) / 100
          loans[index] = updated
        }
        return { ...s, loanOverrides: loans }
      }),
    [],
  )
  const setHypotheticalLoan = useCallback(
    (loan: HypotheticalLoan | null) =>
      setState((s) => (s ? { ...s, hypotheticalLoan: loan } : s)),
    [],
  )
  const setAdditionalOaTopUp = useCallback(
    (v: number) => setState((s) => (s ? { ...s, additionalOaTopUp: v } : s)),
    [],
  )
  const setAdditionalSaTopUp = useCallback(
    (v: number) => setState((s) => (s ? { ...s, additionalSaTopUp: v } : s)),
    [],
  )
  const setIncludeDps = useCallback(
    (v: boolean) => setState((s) => (s ? { ...s, includeDps: v } : s)),
    [],
  )
  const reset = useCallback(() => {
    if (seed) setState(buildInitialState(seed))
  }, [seed])

  const isModified = useMemo(() => {
    if (!state || !seed) return false
    const initial = buildInitialState(seed)
    return (
      state.annualSalary !== initial.annualSalary ||
      state.incomeGrowthRate !== initial.incomeGrowthRate ||
      state.additionalOaTopUp !== initial.additionalOaTopUp ||
      state.additionalSaTopUp !== initial.additionalSaTopUp ||
      state.includeDps !== initial.includeDps ||
      state.hypotheticalLoan !== null ||
      state.loanOverrides.some(
        (l, i) =>
          !l.enabled ||
          l.principal !== initial.loanOverrides[i]?.principal ||
          l.ratePct !== initial.loanOverrides[i]?.ratePct ||
          l.tenureMonths !== initial.loanOverrides[i]?.tenureMonths,
      )
    )
  }, [state, seed])

  const simulatedProjection = useMemo(() => {
    if (!state || !seed) return []

    const currentYear = new Date().getFullYear()
    const monthlyGross = state.annualSalary / 12
    const contribution = calculateCpfContribution(
      monthlyGross,
      seed.currentAge,
      currentYear,
    )

    // Add voluntary top-ups to contribution
    const adjustedContribution = {
      ...contribution,
      oa: contribution.oa + state.additionalOaTopUp,
      sa: contribution.sa + state.additionalSaTopUp,
    }

    const getOaDeduction = (_age: number, calendarYear: number) => {
      const dps = getDpsMonthlyOaDeduction(
        seed.birthYear,
        calendarYear,
        state.includeDps,
      )

      let housing = 0
      for (const loan of state.loanOverrides) {
        if (!loan.enabled) continue
        const endYear =
          calendarYear + Math.ceil(loan.remainingMonths / 12)
        if (calendarYear <= endYear) {
          housing += loan.monthlyPayment
        }
      }

      if (state.hypotheticalLoan) {
        const hypoMonthly = loanMonthlyPayment(
          state.hypotheticalLoan.principal,
          state.hypotheticalLoan.ratePct,
          state.hypotheticalLoan.tenureMonths,
        )
        const hypoEndYear =
          currentYear +
          Math.ceil(state.hypotheticalLoan.tenureMonths / 12)
        if (calendarYear <= hypoEndYear) {
          housing += Math.round(hypoMonthly * 100) / 100
        }
      }

      return dps + housing
    }

    return projectCpfGrowth({
      currentOa: seed.currentCpf.oa,
      currentSa: seed.currentCpf.sa,
      currentMa: seed.currentCpf.ma,
      monthlyContribution: adjustedContribution,
      currentAge: seed.currentAge,
      targetAge: 70,
      incomeGrowthRate: state.incomeGrowthRate,
      getMonthlyOaDeduction: getOaDeduction,
    })
  }, [state, seed])

  const baselineProjection = useMemo(
    () => seed?.extendedProjection ?? [],
    [seed?.extendedProjection],
  )

  const deltaAt55 = useMemo(() => {
    const simAt55 = simulatedProjection.find((p) => p.age === 55)
    const baseAt55 = baselineProjection.find((p) => p.age === 55)
    if (!simAt55 || !baseAt55) return 0
    return Math.round((simAt55.total - baseAt55.total) * 100) / 100
  }, [simulatedProjection, baselineProjection])

  if (!state || !seed) return null

  return {
    state,
    setAnnualSalary,
    setIncomeGrowthRate,
    setLoanEnabled,
    setLoanField,
    setHypotheticalLoan,
    setAdditionalOaTopUp,
    setAdditionalSaTopUp,
    setIncludeDps,
    reset,
    simulatedProjection,
    baselineProjection,
    deltaAt55,
    isModified,
  }
}
