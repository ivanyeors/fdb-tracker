/**
 * Batched data loader for the /api/overview route.
 *
 * Loads ALL data in a single Promise.all (~15 parallel queries),
 * then computes bank total, CPF, investments, loans, and savings rate
 * in-memory using shared pure aggregation functions.
 *
 * Replaces the previous N+1 pattern (80-120 sequential queries).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  buildGiroOutflowByProfile,
  discretionaryForProfileMonth,
  effectiveInflowFromContext,
  monthlyTaxForProfile,
  normalizeMonthKey,
  sumIlpPremiums,
  sumInsuranceOutflowPremiumsSplit,
  sumLoanMonthlyPayments,
  GIRO_OUTFLOW_DESTINATIONS,
  type CashflowRow,
  type IncomeData,
  type InsurancePolicy,
  type ProfileData,
  type TaxEntryData,
} from "@/lib/api/cashflow-aggregation"
import { fetchCashflowRangeSeries } from "@/lib/api/cashflow-range"
import { calculateSavingsRate } from "@/lib/calculations/bank-balance"
import { getAge, calculateCpfContribution } from "@/lib/calculations/cpf"
import {
  estimateOutstandingPrincipal,
  loanMonthlyPayment,
} from "@/lib/calculations/loans"
import { computeTotalInvestmentsValue } from "@/lib/api/net-liquid"
import { decodeBankTransactionPii } from "@/lib/repos/bank-transactions"
import { decodeCpfBalancesPii } from "@/lib/repos/cpf-balances"
import { decodeIncomeConfigPii } from "@/lib/repos/income-config"
import { decodeInsurancePoliciesPii } from "@/lib/repos/insurance-policies"
import { decodeLoanPii } from "@/lib/repos/loans"
import { decodeMonthlyCashflowPii } from "@/lib/repos/monthly-cashflow"
import { decodeTaxReliefInputsPii } from "@/lib/repos/tax-relief-inputs"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type OverviewParams = {
  profileIds: string[]
  familyId: string
  profileId: string | null
  monthFilter: string | null
}

export type OverviewResult = {
  bankTotal: number
  cpfTotal: number
  cpfBreakdown: { oa: number; sa: number; ma: number }
  cpfDelta?: number
  netLiquidValue: number
  ilpFundTotal: number
  investmentTotal: number
  investmentCostBasis: number
  loanTotal: number
  loanMonthlyTotal: number
  loanRemainingMonths: number
  liquidNetWorth: number
  totalNetWorth: number
  savingsRate: number
  latestInflow: number
  latestOutflow: number
  latestMonth: string | null
  previousMonthInflow?: number
  previousMonthOutflow?: number
  previousMonthSavings?: number
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getPreviousMonth(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number)
  const date = new Date(y, (m ?? 1) - 2, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`
}

function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
}

function getRemainingMonths(startDate: string, tenureMonths: number): number {
  const start = new Date(startDate)
  const end = new Date(start)
  end.setMonth(end.getMonth() + tenureMonths)
  const now = new Date()
  const diff =
    (end.getFullYear() - now.getFullYear()) * 12 +
    (end.getMonth() - now.getMonth())
  return Math.max(0, diff)
}

/* ------------------------------------------------------------------ */
/*  Bank total from pre-fetched data                                   */
/* ------------------------------------------------------------------ */

type BankTotalInput = {
  accounts: Array<{
    id: string
    profile_id: string | null
    opening_balance: number | null
    locked_amount: number | null
  }>
  primaryAccountByProfile: Map<string, string>
  snapshots: Array<{
    account_id: string
    month: string
    closing_balance: number
    is_reconciliation: boolean
  }>
  giroDebitByAccount: Map<string, number>
  giroCreditByAccount: Map<string, number>
  targetMonth: string
  cashflowByKey: Map<string, CashflowRow>
  profileById: Map<string, ProfileData>
  incomeByProfileId: Map<string, IncomeData>
  giroByProfile: Map<string, number>
  insuranceByProfile: Map<string, InsurancePolicy[]>
  ilpByProfile: Map<
    string,
    Array<{ monthly_premium: number; premium_payment_mode?: string | null }>
  >
  loansByProfile: Map<
    string,
    Array<{ principal: number; rate_pct: number; tenure_months: number; use_cpf_oa?: boolean; start_date?: string | null }>
  >
  savingsGoalsByProfile: Map<string, number>
  taxReliefByProfileYear: Map<
    string,
    Array<{ relief_type: string; amount: number }>
  >
  taxEntryByProfileYear?: Map<string, TaxEntryData>
}

function computeBankTotalFromData(input: BankTotalInput): number {
  const {
    accounts,
    primaryAccountByProfile,
    snapshots,
    giroDebitByAccount,
    giroCreditByAccount,
    targetMonth,
    cashflowByKey,
    profileById,
    incomeByProfileId,
    giroByProfile,
    insuranceByProfile,
    ilpByProfile,
    loansByProfile,
    savingsGoalsByProfile,
    taxReliefByProfileYear,
    taxEntryByProfileYear,
  } = input
  let total = 0

  for (const account of accounts) {
    const profileId = account.profile_id
    const isPrimary = profileId
      ? primaryAccountByProfile.get(profileId) === account.id
      : false

    // Find most recent reconciliation snapshot <= targetMonth
    const accountSnapshots = snapshots
      .filter(
        (s) =>
          s.account_id === account.id &&
          s.is_reconciliation &&
          s.month <= targetMonth
      )
      .sort((a, b) => b.month.localeCompare(a.month))

    const snapshot = accountSnapshots[0]
    const lockedAmount = account.locked_amount ?? 0
    const baselineBalance = snapshot
      ? snapshot.closing_balance
      : (account.opening_balance ?? 0) - lockedAmount
    const baselineMonth = snapshot?.month ?? null

    // Determine replay range
    let startMonth: string
    if (baselineMonth) {
      const [y, m] = baselineMonth.split("-").map(Number) as [number, number]
      const nextM = m === 12 ? 1 : m + 1
      const nextY = m === 12 ? y + 1 : y
      startMonth = `${nextY}-${String(nextM).padStart(2, "0")}-01`
    } else {
      const now = new Date()
      const d = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      startMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
    }

    if (startMonth > targetMonth) {
      total += Math.max(0, baselineBalance)
      continue
    }

    // Generate months to replay
    const months: string[] = []
    {
      const [sY, sM] = startMonth.split("-").map(Number) as [number, number]
      const [eY, eM] = targetMonth.split("-").map(Number) as [number, number]
      let y = sY
      let m = sM
      while (y < eY || (y === eY && m <= eM)) {
        months.push(`${y}-${String(m).padStart(2, "0")}-01`)
        m++
        if (m > 12) {
          m = 1
          y++
        }
      }
    }

    const giroDebit = giroDebitByAccount.get(account.id) ?? 0
    const giroCredit = giroCreditByAccount.get(account.id) ?? 0

    let running = baselineBalance
    for (const month of months) {
      let inflow = 0
      let outflow = 0

      if (profileId && isPrimary) {
        const monthStr = normalizeMonthKey(month)
        const year =
          Number.parseInt(monthStr.slice(0, 4), 10) || new Date().getFullYear()

        inflow = effectiveInflowFromContext(
          profileId,
          monthStr,
          year,
          cashflowByKey,
          profileById,
          incomeByProfileId
        )

        // Compute effective outflow inline from pre-fetched data
        outflow += discretionaryForProfileMonth(
          profileId,
          monthStr,
          cashflowByKey,
          giroByProfile
        )
        const pols = insuranceByProfile.get(profileId) ?? []
        const insSplit = sumInsuranceOutflowPremiumsSplit(pols)
        outflow += insSplit.insurance + insSplit.ilpFromLegacyPolicies
        outflow += sumIlpPremiums(ilpByProfile.get(profileId) ?? [])
        outflow += sumLoanMonthlyPayments(loansByProfile.get(profileId) ?? [], monthStr)
        outflow += savingsGoalsByProfile.get(profileId) ?? 0
        outflow += monthlyTaxForProfile(
          profileId,
          year,
          profileById,
          incomeByProfileId,
          pols,
          taxReliefByProfileYear.get(`${profileId}:${year}`) ?? [],
          taxEntryByProfileYear,
        )
      }

      const netFlow = inflow - outflow + giroCredit - giroDebit
      running += netFlow
    }

    total += Math.max(0, running)
  }

  return total
}

/* ------------------------------------------------------------------ */
/*  Lookup-map builders                                                */
/* ------------------------------------------------------------------ */

type LoanWithId = {
  id: string
  principal: number
  rate_pct: number
  tenure_months: number
  start_date: string
  use_cpf_oa: boolean
}

type LoanForCashflow = {
  principal: number
  rate_pct: number
  tenure_months: number
  use_cpf_oa?: boolean
  start_date?: string | null
}

type IlpRowMin = {
  monthly_premium: number
  premium_payment_mode?: string | null
}

type OverviewLookups = {
  cashflowByKey: Map<string, CashflowRow>
  profileById: Map<string, ProfileData & { name: string }>
  primaryAccountByProfile: Map<string, string>
  incomeByProfileId: Map<string, IncomeData>
  giroByProfile: Map<string, number>
  insuranceByProfile: Map<string, InsurancePolicy[]>
  ilpByProfile: Map<string, IlpRowMin[]>
  loansByProfile: Map<string, LoanWithId[]>
  loansForCashflow: Map<string, LoanForCashflow[]>
  taxReliefByProfileYear: Map<
    string,
    Array<{ relief_type: string; amount: number }>
  >
  savingsGoalsByProfile: Map<string, number>
}

function buildCashflowByKey(
  rows: Array<Record<string, unknown>>,
): Map<string, CashflowRow> {
  const map = new Map<string, CashflowRow>()
  for (const row of rows) {
    const m = normalizeMonthKey(row.month as string)
    const key = `${row.profile_id as string}:${m}`
    if (map.has(key)) continue
    const decoded = decodeMonthlyCashflowPii(row)
    map.set(key, { inflow: decoded.inflow, outflow: decoded.outflow })
  }
  return map
}

function buildProfileMaps(
  rows: Array<{
    id: string
    birth_year: number
    name: string
    primary_bank_account_id: string | null
    self_help_group: string | null
  }>,
): {
  profileById: Map<string, ProfileData & { name: string }>
  primaryAccountByProfile: Map<string, string>
} {
  const profileById = new Map<string, ProfileData & { name: string }>()
  const primaryAccountByProfile = new Map<string, string>()
  for (const p of rows) {
    profileById.set(p.id, {
      birth_year: p.birth_year,
      name: p.name,
      self_help_group: p.self_help_group ?? undefined,
    })
    if (p.primary_bank_account_id) {
      primaryAccountByProfile.set(p.id, p.primary_bank_account_id)
    }
  }
  return { profileById, primaryAccountByProfile }
}

function buildIncomeMap(
  rows: Array<Record<string, unknown>>,
): Map<string, IncomeData> {
  const map = new Map<string, IncomeData>()
  for (const ic of rows) {
    const decoded = decodeIncomeConfigPii(ic)
    map.set(ic.profile_id as string, {
      annual_salary: decoded.annual_salary ?? 0,
      bonus_estimate: decoded.bonus_estimate ?? null,
    })
  }
  return map
}

function buildInsuranceMap(
  rows: Array<Record<string, unknown>>,
): Map<string, InsurancePolicy[]> {
  const nowDate = new Date().toISOString().slice(0, 10)
  const map = new Map<string, InsurancePolicy[]>()
  for (const pol of rows) {
    const pid = pol.profile_id as string
    if (pol.end_date && (pol.end_date as string) < nowDate) continue
    const list = map.get(pid) ?? []
    const decoded = decodeInsurancePoliciesPii(pol)
    list.push({
      premium_amount: decoded.premium_amount ?? 0,
      frequency: pol.frequency as string,
      is_active: pol.is_active as boolean | null,
      deduct_from_outflow: pol.deduct_from_outflow as boolean | null,
      type: pol.type as string,
      coverage_amount: decoded.coverage_amount,
    })
    map.set(pid, list)
  }
  return map
}

function buildIlpMap(
  rows: Array<{
    profile_id: string
    monthly_premium: number
    premium_payment_mode?: string | null
  }>,
): Map<string, IlpRowMin[]> {
  const map = new Map<string, IlpRowMin[]>()
  for (const row of rows) {
    const list = map.get(row.profile_id) ?? []
    list.push({
      monthly_premium: row.monthly_premium,
      premium_payment_mode: row.premium_payment_mode ?? null,
    })
    map.set(row.profile_id, list)
  }
  return map
}

function buildLoanMaps(
  rows: Array<Record<string, unknown>>,
): {
  loansByProfile: Map<string, LoanWithId[]>
  loansForCashflow: Map<string, LoanForCashflow[]>
} {
  const loansByProfile = new Map<string, LoanWithId[]>()
  for (const row of rows) {
    const pid = row.profile_id as string
    const list = loansByProfile.get(pid) ?? []
    const decoded = decodeLoanPii(row)
    list.push({
      id: row.id as string,
      principal: decoded.principal ?? 0,
      rate_pct: row.rate_pct as number,
      tenure_months: row.tenure_months as number,
      start_date: row.start_date as string,
      use_cpf_oa: !!row.use_cpf_oa,
    })
    loansByProfile.set(pid, list)
  }

  const loansForCashflow = new Map<string, LoanForCashflow[]>()
  for (const [pid, loans] of loansByProfile) {
    loansForCashflow.set(
      pid,
      loans.map((l) => ({
        principal: l.principal,
        rate_pct: l.rate_pct,
        tenure_months: l.tenure_months,
        use_cpf_oa: l.use_cpf_oa,
        start_date: l.start_date,
      })),
    )
  }
  return { loansByProfile, loansForCashflow }
}

function buildTaxReliefMap(
  rows: Array<{
    profile_id: string
    year: number
    relief_type: string
    amount_enc?: string | null
  }>,
): Map<string, Array<{ relief_type: string; amount: number }>> {
  const map = new Map<string, Array<{ relief_type: string; amount: number }>>()
  for (const tr of rows) {
    const key = `${tr.profile_id}:${tr.year}`
    const list = map.get(key) ?? []
    list.push({
      relief_type: tr.relief_type,
      amount: decodeTaxReliefInputsPii(tr).amount ?? 0,
    })
    map.set(key, list)
  }
  return map
}

function buildSavingsGoalsMap(
  rows: Array<{ profile_id: string; monthly_auto_amount: number | null }>,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const g of rows) {
    const amt = g.monthly_auto_amount ?? 0
    map.set(g.profile_id, (map.get(g.profile_id) ?? 0) + amt)
  }
  return map
}

function buildOverviewLookups(input: {
  cashflowRows: Array<{ profile_id: string; month: string }>
  profileRows: Array<{
    id: string
    birth_year: number
    name: string
    primary_bank_account_id: string | null
    self_help_group: string | null
  }>
  incomeRows: Array<Record<string, unknown>>
  giroRules: Array<{
    amount: number
    source_bank_account_id: string
    linked_entity_type: string | null
  }>
  bankAccountRows: Array<{ id: string; profile_id: string | null }>
  insuranceRows: Array<Record<string, unknown>>
  ilpRows: Array<{
    profile_id: string
    monthly_premium: number
    premium_payment_mode?: string | null
  }>
  loansRows: Array<Record<string, unknown>>
  taxReliefRows: Array<{
    profile_id: string
    year: number
    relief_type: string
    amount_enc?: string | null
  }>
  savingsGoalRows: Array<{
    profile_id: string
    monthly_auto_amount: number | null
  }>
  profileIds: string[]
}): OverviewLookups {
  const cashflowByKey = buildCashflowByKey(input.cashflowRows)
  const { profileById, primaryAccountByProfile } = buildProfileMaps(
    input.profileRows,
  )
  const incomeByProfileId = buildIncomeMap(input.incomeRows)

  const giroAccountIds = new Set(
    input.giroRules.map((r) => r.source_bank_account_id),
  )
  const giroAccounts = input.bankAccountRows.filter((a) =>
    giroAccountIds.has(a.id),
  )
  const giroByProfile = buildGiroOutflowByProfile(
    input.giroRules,
    giroAccounts,
    input.profileIds,
  )

  const insuranceByProfile = buildInsuranceMap(input.insuranceRows)
  const ilpByProfile = buildIlpMap(input.ilpRows)
  const { loansByProfile, loansForCashflow } = buildLoanMaps(input.loansRows)
  const taxReliefByProfileYear = buildTaxReliefMap(input.taxReliefRows)
  const savingsGoalsByProfile = buildSavingsGoalsMap(input.savingsGoalRows)

  return {
    cashflowByKey,
    profileById,
    primaryAccountByProfile,
    incomeByProfileId,
    giroByProfile,
    insuranceByProfile,
    ilpByProfile,
    loansByProfile,
    loansForCashflow,
    taxReliefByProfileYear,
    savingsGoalsByProfile,
  }
}

function buildTaxEntryMap(
  rows: Array<{
    profile_id: string
    year: number
    actual_amount: number | null
  }>,
): Map<string, TaxEntryData> {
  const map = new Map<string, TaxEntryData>()
  for (const te of rows) {
    map.set(`${te.profile_id}:${te.year}`, { actual_amount: te.actual_amount })
  }
  return map
}

function buildBankGiroMaps(
  rules: Array<{
    amount: number
    source_bank_account_id: string
    destination_bank_account_id: string | null
    destination_type: string | null
  }>,
): {
  giroDebitByAccount: Map<string, number>
  giroCreditByAccount: Map<string, number>
} {
  const giroDebitByAccount = new Map<string, number>()
  const giroCreditByAccount = new Map<string, number>()
  for (const rule of rules) {
    const debitId = rule.source_bank_account_id
    giroDebitByAccount.set(
      debitId,
      (giroDebitByAccount.get(debitId) ?? 0) + rule.amount,
    )
    if (
      rule.destination_type === "bank_account" &&
      rule.destination_bank_account_id
    ) {
      const creditId = rule.destination_bank_account_id
      giroCreditByAccount.set(
        creditId,
        (giroCreditByAccount.get(creditId) ?? 0) + rule.amount,
      )
    }
  }
  return { giroDebitByAccount, giroCreditByAccount }
}

/* ------------------------------------------------------------------ */
/*  CPF totals                                                         */
/* ------------------------------------------------------------------ */

type CpfBreakdown = { total: number; oa: number; sa: number; ma: number }

function projectCpfFromIncome(
  profile: ProfileData,
  incomeConfig: IncomeData,
  month: string | null,
): CpfBreakdown {
  const refDate = month ? new Date(month) : new Date()
  const refYear = refDate.getFullYear()
  const age = getAge(profile.birth_year, refYear)
  const monthlyGross = incomeConfig.annual_salary / 12
  const contribution = calculateCpfContribution(monthlyGross, age, refYear)
  const monthsElapsed = refDate.getMonth() + 1
  const oa = contribution.oa * monthsElapsed
  const sa = contribution.sa * monthsElapsed
  const ma = contribution.ma * monthsElapsed
  return { total: oa + sa + ma, oa, sa, ma }
}

function getCpfForMonth(input: {
  month: string | null
  targetProfileIds: string[]
  cpfRows: Array<Record<string, unknown>>
  profileById: Map<string, ProfileData>
  incomeByProfileId: Map<string, IncomeData>
}): CpfBreakdown {
  const { month, targetProfileIds, cpfRows, profileById, incomeByProfileId } =
    input
  let total = 0
  let oa = 0
  let sa = 0
  let ma = 0

  for (const pid of targetProfileIds) {
    const latest = cpfRows.find(
      (c) =>
        (c.profile_id as string) === pid &&
        (month == null || (c.month as string) <= month),
    )

    if (latest) {
      const decoded = decodeCpfBalancesPii(latest)
      const o = decoded.oa ?? 0
      const s = decoded.sa ?? 0
      const m = decoded.ma ?? 0
      oa += o
      sa += s
      ma += m
      total += o + s + m
      continue
    }

    const profile = profileById.get(pid)
    const incomeConfig = incomeByProfileId.get(pid)
    if (profile && incomeConfig && incomeConfig.annual_salary > 0) {
      const projected = projectCpfFromIncome(profile, incomeConfig, month)
      oa += projected.oa
      sa += projected.sa
      ma += projected.ma
      total += projected.total
    }
  }

  return { total, oa, sa, ma }
}

function computeCpfTotals(input: {
  monthFilter: string | null
  targetProfileIds: string[]
  cpfRows: Array<Record<string, unknown>>
  profileById: Map<string, ProfileData>
  incomeByProfileId: Map<string, IncomeData>
}): { cpfCurrent: CpfBreakdown; cpfDelta: number | undefined } {
  const { monthFilter, targetProfileIds, cpfRows } = input
  let cpfReferenceMonth: string | null = monthFilter
    ? normalizeMonthKey(monthFilter)
    : null
  if (!cpfReferenceMonth && targetProfileIds.length > 0) {
    const latestCpf = cpfRows.find((c) =>
      targetProfileIds.includes(c.profile_id as string),
    )
    cpfReferenceMonth = (latestCpf?.month as string | undefined) ?? null
  }

  const cpfCurrent = getCpfForMonth({ ...input, month: cpfReferenceMonth })
  let cpfDelta: number | undefined
  if (cpfReferenceMonth) {
    const prevMonth = getPreviousMonth(cpfReferenceMonth)
    const cpfPrevious = getCpfForMonth({ ...input, month: prevMonth })
    cpfDelta = cpfCurrent.total - cpfPrevious.total
  }
  return { cpfCurrent, cpfDelta }
}

/* ------------------------------------------------------------------ */
/*  Loan totals (post-batch query for repayment history)               */
/* ------------------------------------------------------------------ */

async function computeLoanTotals(
  supabase: SupabaseClient,
  allLoans: Array<{
    id: string
    principal: number
    rate_pct: number
    tenure_months: number
    start_date: string
  }>,
): Promise<{
  loanTotal: number
  loanMonthlyTotal: number
  loanRemainingMonths: number
}> {
  if (allLoans.length === 0) {
    return { loanTotal: 0, loanMonthlyTotal: 0, loanRemainingMonths: 0 }
  }

  const loanIds = allLoans.map((l) => l.id)
  const [{ data: repayments }, { data: earlyRepayments }] = await Promise.all([
    supabase
      .from("loan_repayments")
      .select("loan_id, amount, date")
      .in("loan_id", loanIds)
      .order("date", { ascending: true }),
    supabase
      .from("loan_early_repayments")
      .select("loan_id, amount, date")
      .in("loan_id", loanIds)
      .order("date", { ascending: true }),
  ])

  let loanTotal = 0
  let loanMonthlyTotal = 0
  let loanRemainingMonths = 0
  for (const loan of allLoans) {
    loanMonthlyTotal += loanMonthlyPayment(
      loan.principal,
      loan.rate_pct,
      loan.tenure_months,
    )
    const remaining = getRemainingMonths(loan.start_date, loan.tenure_months)
    if (remaining > loanRemainingMonths) loanRemainingMonths = remaining

    const loanRepayments = (repayments ?? [])
      .filter((r) => r.loan_id === loan.id)
      .map((r) => ({ amount: r.amount, date: r.date }))
    const loanEarlyRepayments = (earlyRepayments ?? [])
      .filter((r) => r.loan_id === loan.id)
      .map((r) => ({ amount: r.amount, date: r.date }))

    loanTotal += estimateOutstandingPrincipal(
      loan.principal,
      loan.rate_pct,
      loanRepayments,
      loanEarlyRepayments,
    )
  }

  return { loanTotal, loanMonthlyTotal, loanRemainingMonths }
}

/* ------------------------------------------------------------------ */
/*  Savings-rate metrics                                               */
/* ------------------------------------------------------------------ */

type SavingsComputeTarget = {
  computeMonth: string | null
  computePrev: boolean
}

function resolveSavingsComputeTarget(input: {
  monthFilter: string | null
  profileId: string | null
  profileIds: string[]
  cashflowRows: Array<{ profile_id: string; month: string }>
}): SavingsComputeTarget {
  const { monthFilter, profileId, profileIds, cashflowRows } = input
  if (monthFilter) {
    return { computeMonth: normalizeMonthKey(monthFilter), computePrev: true }
  }
  const relevantRows = profileId
    ? cashflowRows.filter((r) => r.profile_id === profileId)
    : cashflowRows.filter((r) => profileIds.includes(r.profile_id))
  if (relevantRows.length === 0) {
    return { computeMonth: null, computePrev: false }
  }
  return {
    computeMonth: normalizeMonthKey(relevantRows[0].month),
    computePrev: false,
  }
}

type SavingsRateMetrics = {
  savingsRate: number
  latestInflow: number
  latestOutflow: number
  latestMonth: string | null
  previousMonthInflow?: number
  previousMonthOutflow?: number
  previousMonthSavings?: number
}

async function computeSavingsRateMetrics(input: {
  supabase: SupabaseClient
  target: SavingsComputeTarget
  profileId: string | null
  familyId: string
  targetProfileIds: string[]
}): Promise<SavingsRateMetrics> {
  const { supabase, target, profileId, familyId, targetProfileIds } = input
  const { computeMonth, computePrev } = target
  const empty: SavingsRateMetrics = {
    savingsRate: 0,
    latestInflow: 0,
    latestOutflow: 0,
    latestMonth: null,
  }
  if (!computeMonth) return empty

  const latestMonth = computeMonth
  const prevMonth = getPreviousMonth(latestMonth)
  const rangeStart = computePrev ? prevMonth : latestMonth

  const [cashflowSeries, bankTxnsRes] = await Promise.all([
    fetchCashflowRangeSeries(supabase, {
      profileIds: targetProfileIds,
      familyId,
      startMonth: rangeStart,
      endMonth: latestMonth,
    }),
    // Bank-statement totals override the manual `discretionary` figure when
    // the user has imported statements — mirrors cashflow-client.tsx behavior.
    (() => {
      const months = computePrev ? [prevMonth, latestMonth] : [latestMonth]
      let qb = supabase
        .from("bank_transactions")
        .select("month, amount_enc")
        .in("month", months)
        .eq("txn_type", "debit")
        .eq("exclude_from_spending", false)
      qb = profileId
        ? qb.eq("profile_id", profileId)
        : qb.eq("family_id", familyId)
      return qb
    })(),
  ])

  const bankTotalByMonth = new Map<string, number>()
  for (const t of bankTxnsRes.data ?? []) {
    const m = normalizeMonthKey(t.month as string)
    const decoded = decodeBankTransactionPii({
      amount_enc: (t as { amount_enc?: string | null }).amount_enc,
    })
    const amt = Math.abs(decoded.amount ?? 0)
    bankTotalByMonth.set(m, (bankTotalByMonth.get(m) ?? 0) + amt)
  }

  const applyBankOverride = (
    row: { discretionary: number; totalOutflow: number } | undefined,
    month: string,
  ): number => {
    if (!row) return 0
    const bankTotal = bankTotalByMonth.get(month) ?? 0
    const effectiveDiscretionary = bankTotal > 0 ? bankTotal : row.discretionary
    return row.totalOutflow - row.discretionary + effectiveDiscretionary
  }

  const result: SavingsRateMetrics = { ...empty, latestMonth }
  const latestRow = cashflowSeries.find((r) => r.month === latestMonth)
  if (latestRow) {
    result.latestInflow = latestRow.inflow
    result.latestOutflow = applyBankOverride(latestRow, latestMonth)
    result.savingsRate = calculateSavingsRate(
      result.latestInflow,
      result.latestOutflow,
    )
  }

  if (computePrev) {
    const prevRow = cashflowSeries.find((r) => r.month === prevMonth)
    if (prevRow) {
      result.previousMonthInflow = prevRow.inflow
      result.previousMonthOutflow = applyBankOverride(prevRow, prevMonth)
      result.previousMonthSavings =
        result.previousMonthInflow - result.previousMonthOutflow
    }
  }

  return result
}

/* ------------------------------------------------------------------ */
/*  Main batched loader                                                */
/* ------------------------------------------------------------------ */

export async function fetchOverviewData(
  supabase: SupabaseClient,
  params: OverviewParams
): Promise<OverviewResult> {
  const { profileIds, familyId, profileId, monthFilter } = params
  const targetProfileIds = profileId ? [profileId] : profileIds
  const currentYear = new Date().getFullYear()
  const targetMonth = monthFilter
    ? normalizeMonthKey(monthFilter)
    : getCurrentMonth()

  // Compute a generous month range for bank total replay and cashflow
  const now = new Date()
  const rangeStart = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, "0")}-01`

  // Hoist sentinel arrays so the parallel batch below stays branch-free.
  const profileIdFilter = profileIds.length > 0 ? profileIds : ["__none__"]
  const targetProfileIdFilter =
    targetProfileIds.length > 0 ? targetProfileIds : ["__none__"]

  // ── Batch load ALL data in parallel ──
  const [
    cashflowRes,
    profilesRes,
    incomeRes,
    giroRulesRes,
    insuranceRes,
    ilpRes,
    loansRes,
    taxReliefRes,
    savingsGoalsRes,
    cpfRes,
    bankAccountsRes,
    snapshotsRes,
    giroAllRulesRes,
    investmentsResult,
  ] = await Promise.all([
    // 1. Monthly cashflow (for savings rate + bank balance replay)
    supabase
      .from("monthly_cashflow")
      .select("profile_id, month, inflow_enc, outflow_enc")
      .in("profile_id", profileIdFilter)
      .gte("month", rangeStart)
      .order("month", { ascending: false }),
    // 2. Profiles
    supabase
      .from("profiles")
      .select("id, birth_year, name, primary_bank_account_id, self_help_group")
      .in("id", profileIdFilter),
    // 3. Income config
    supabase
      .from("income_config")
      .select("profile_id, annual_salary_enc, bonus_estimate_enc")
      .in("profile_id", profileIdFilter),
    // 4. GIRO rules for outflow
    supabase
      .from("giro_rules")
      .select("id, amount, source_bank_account_id, linked_entity_type")
      .eq("is_active", true)
      .in("destination_type", [...GIRO_OUTFLOW_DESTINATIONS]),
    // 5. Insurance policies
    supabase
      .from("insurance_policies")
      .select(
        "profile_id, premium_amount_enc, frequency, is_active, deduct_from_outflow, type, coverage_amount_enc, end_date",
      )
      .in("profile_id", profileIdFilter),
    // 6. ILP products (profile-scoped)
    supabase
      .from("ilp_products")
      .select("profile_id, monthly_premium, premium_payment_mode")
      .in("profile_id", profileIdFilter),
    // 7. Loans (with extra fields for outstanding principal)
    supabase
      .from("loans")
      .select("id, profile_id, principal, principal_enc, rate_pct, tenure_months, start_date, use_cpf_oa")
      .in("profile_id", profileIdFilter),
    // 8. Tax relief inputs
    supabase
      .from("tax_relief_inputs")
      .select("profile_id, year, relief_type, amount_enc")
      .in("profile_id", profileIdFilter)
      .in("year", [currentYear, currentYear - 1]),
    // 9. Savings goals
    supabase
      .from("savings_goals")
      .select("profile_id, monthly_auto_amount")
      .in("profile_id", profileIdFilter),
    // 11. CPF balances
    supabase
      .from("cpf_balances")
      .select("profile_id, month, oa_enc, sa_enc, ma_enc")
      .in("profile_id", targetProfileIdFilter)
      .order("month", { ascending: false }),
    // 12. Bank accounts
    supabase
      .from("bank_accounts")
      .select("id, profile_id, opening_balance, locked_amount, family_id")
      .eq("family_id", familyId),
    // 13. Bank balance snapshots
    supabase
      .from("bank_balance_snapshots")
      .select("account_id, month, closing_balance, is_reconciliation")
      .eq("is_reconciliation", true)
      .order("month", { ascending: false }),
    // 14. ALL giro rules (for bank balance debit/credit)
    supabase
      .from("giro_rules")
      .select(
        "amount, source_bank_account_id, destination_bank_account_id, destination_type, is_active"
      )
      .eq("is_active", true),
    // 15. Investments (NLV + ILP fund values) — uses its own internal queries + external APIs
    computeTotalInvestmentsValue(supabase, familyId, profileId, monthFilter),
  ])

  // Fetch tax entries (actual_amount) for actual vs estimated tax
  const { data: taxEntriesData } = await supabase
    .from("tax_entries")
    .select("profile_id, year, actual_amount")
    .in("profile_id", profileIdFilter)
    .in("year", [currentYear, currentYear - 1])

  const taxEntryByProfileYear = buildTaxEntryMap(taxEntriesData ?? [])

  // ── Build lookup maps ──
  const lookups = buildOverviewLookups({
    cashflowRows: cashflowRes.data ?? [],
    profileRows: profilesRes.data ?? [],
    incomeRows: incomeRes.data ?? [],
    giroRules: giroRulesRes.data ?? [],
    bankAccountRows: bankAccountsRes.data ?? [],
    insuranceRows: insuranceRes.data ?? [],
    ilpRows: ilpRes.data ?? [],
    loansRows: loansRes.data ?? [],
    taxReliefRows: taxReliefRes.data ?? [],
    savingsGoalRows: savingsGoalsRes.data ?? [],
    profileIds,
  })
  const {
    cashflowByKey,
    profileById,
    primaryAccountByProfile,
    incomeByProfileId,
    giroByProfile,
    insuranceByProfile,
    ilpByProfile,
    loansByProfile,
    loansForCashflow,
    taxReliefByProfileYear,
    savingsGoalsByProfile,
  } = lookups

  // ── Bank Total ──
  const filteredBankAccounts = profileId
    ? (bankAccountsRes.data ?? []).filter(
        (a) =>
          a.family_id === familyId &&
          (a.profile_id === profileId || a.profile_id === null)
      )
    : (bankAccountsRes.data ?? []).filter((a) => a.family_id === familyId)

  // Build GIRO debit/credit maps per bank account
  const { giroDebitByAccount, giroCreditByAccount } = buildBankGiroMaps(
    giroAllRulesRes.data ?? [],
  )

  // Filter snapshots to only relevant accounts
  const bankAccountIds = new Set(filteredBankAccounts.map((a) => a.id))
  const relevantSnapshots = (snapshotsRes.data ?? []).filter((s) =>
    bankAccountIds.has(s.account_id)
  )

  const bankTotal = computeBankTotalFromData({
    accounts: filteredBankAccounts,
    primaryAccountByProfile,
    snapshots: relevantSnapshots,
    giroDebitByAccount,
    giroCreditByAccount,
    targetMonth,
    cashflowByKey,
    profileById,
    incomeByProfileId,
    giroByProfile,
    insuranceByProfile,
    ilpByProfile,
    loansByProfile: loansForCashflow,
    savingsGoalsByProfile,
    taxReliefByProfileYear,
    taxEntryByProfileYear,
  })

  // ── CPF Total ──
  const { cpfCurrent, cpfDelta } = computeCpfTotals({
    monthFilter,
    targetProfileIds,
    cpfRows: cpfRes.data ?? [],
    profileById,
    incomeByProfileId,
  })

  // ── Investments ──
  const { netLiquidValue, ilpFundTotal, investmentTotal, totalCostBasis } =
    investmentsResult

  // ── Loans ──
  const allLoans: Array<{
    id: string
    principal: number
    rate_pct: number
    tenure_months: number
    start_date: string
  }> = []
  for (const pid of profileIds) {
    const profileLoans = loansByProfile.get(pid) ?? []
    allLoans.push(...profileLoans)
  }
  const { loanTotal, loanMonthlyTotal, loanRemainingMonths } =
    await computeLoanTotals(supabase, allLoans)

  // ── Savings Rate ──
  // Reuse fetchCashflowRangeSeries so the overview card stays in lock-step with
  // the dedicated cashflow page (same set of outflow components: ilpOneTime,
  // earlyRepayments, goalContributions, investments, taxReliefCash, etc.).
  const computeTarget = resolveSavingsComputeTarget({
    monthFilter,
    profileId,
    profileIds,
    cashflowRows: cashflowRes.data ?? [],
  })
  const savings = await computeSavingsRateMetrics({
    supabase,
    target: computeTarget,
    profileId,
    familyId,
    targetProfileIds,
  })
  const {
    savingsRate,
    latestInflow,
    latestOutflow,
    latestMonth,
    previousMonthInflow,
    previousMonthOutflow,
    previousMonthSavings,
  } = savings

  // ── Net Worth ──
  const liquidNetWorth = bankTotal + investmentTotal - loanTotal
  const totalNetWorth = liquidNetWorth + cpfCurrent.total

  const round = (n: number) => Math.round(n * 100) / 100

  return {
    bankTotal: round(bankTotal),
    cpfTotal: round(cpfCurrent.total),
    cpfBreakdown: {
      oa: round(cpfCurrent.oa),
      sa: round(cpfCurrent.sa),
      ma: round(cpfCurrent.ma),
    },
    ...(cpfDelta === undefined ? {} : { cpfDelta: round(cpfDelta) }),
    netLiquidValue: round(netLiquidValue),
    ilpFundTotal: round(ilpFundTotal),
    investmentTotal: round(investmentTotal),
    investmentCostBasis: round(totalCostBasis),
    loanTotal: round(loanTotal),
    loanMonthlyTotal: round(loanMonthlyTotal),
    loanRemainingMonths,
    liquidNetWorth: round(liquidNetWorth),
    totalNetWorth: round(totalNetWorth),
    savingsRate: round(savingsRate),
    latestInflow: round(latestInflow),
    latestOutflow: round(latestOutflow),
    latestMonth,
    ...(previousMonthInflow === undefined
      ? {}
      : { previousMonthInflow: round(previousMonthInflow) }),
    ...(previousMonthOutflow === undefined
      ? {}
      : { previousMonthOutflow: round(previousMonthOutflow) }),
    ...(previousMonthSavings === undefined
      ? {}
      : { previousMonthSavings: round(previousMonthSavings) }),
  }
}
