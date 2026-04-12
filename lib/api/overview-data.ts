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
import { calculateSavingsRate } from "@/lib/calculations/bank-balance"
import { getAge, calculateCpfContribution } from "@/lib/calculations/cpf"
import {
  estimateOutstandingPrincipal,
  loanMonthlyPayment,
} from "@/lib/calculations/loans"
import { computeTotalInvestmentsValue } from "@/lib/api/net-liquid"

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
  const date = new Date(y!, (m ?? 1) - 2, 1)
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
/*  Cashflow aggregation from pre-fetched data                         */
/* ------------------------------------------------------------------ */

function computeCashflowForMonth(
  month: string,
  profileIds: string[],
  cashflowByKey: Map<string, CashflowRow>,
  profileById: Map<string, ProfileData>,
  incomeByProfileId: Map<string, IncomeData>,
  giroByProfile: Map<string, number>,
  insuranceByProfile: Map<string, InsurancePolicy[]>,
  ilpByProfile: Map<
    string,
    Array<{ monthly_premium: number; premium_payment_mode?: string | null }>
  >,
  loansByProfile: Map<
    string,
    Array<{ principal: number; rate_pct: number; tenure_months: number; use_cpf_oa?: boolean; start_date?: string | null }>
  >,
  savingsGoalsByProfile: Map<string, number>,
  taxReliefByProfileYear: Map<
    string,
    Array<{ relief_type: string; amount: number }>
  >,
  sharedIlp: number,
  taxEntryByProfileYear?: Map<string, TaxEntryData>
): { inflow: number; outflow: number } {
  const monthStr = normalizeMonthKey(month)
  const year = parseInt(monthStr.slice(0, 4), 10) || new Date().getFullYear()

  let totalInflow = 0
  let totalOutflow = 0

  for (const pid of profileIds) {
    // Only include profiles that have a cashflow row for this month
    const key = `${pid}:${monthStr}`
    const hasCashflow = cashflowByKey.has(key)

    // Inflow
    totalInflow += effectiveInflowFromContext(
      pid,
      monthStr,
      year,
      cashflowByKey,
      profileById,
      incomeByProfileId
    )

    // Only compute outflow for profiles that have a cashflow entry for this month
    // (matches the original behavior where we iterated over rows returned from DB)
    if (!hasCashflow) continue

    // Discretionary
    totalOutflow += discretionaryForProfileMonth(
      pid,
      monthStr,
      cashflowByKey,
      giroByProfile
    )

    // Insurance + legacy ILP
    const pols = insuranceByProfile.get(pid) ?? []
    const insSplit = sumInsuranceOutflowPremiumsSplit(pols)
    totalOutflow += insSplit.insurance + insSplit.ilpFromLegacyPolicies

    // ILP products
    totalOutflow += sumIlpPremiums(ilpByProfile.get(pid) ?? [])

    // Loans
    totalOutflow += sumLoanMonthlyPayments(loansByProfile.get(pid) ?? [], monthStr)

    // Savings goals
    totalOutflow += savingsGoalsByProfile.get(pid) ?? 0

    // Tax
    totalOutflow += monthlyTaxForProfile(
      pid,
      year,
      profileById,
      incomeByProfileId,
      pols,
      taxReliefByProfileYear.get(`${pid}:${year}`) ?? [],
      taxEntryByProfileYear,
    )
  }

  // Shared ILP (family-level, profile_id is null)
  totalOutflow += sharedIlp

  return { inflow: totalInflow, outflow: totalOutflow }
}

/* ------------------------------------------------------------------ */
/*  Bank total from pre-fetched data                                   */
/* ------------------------------------------------------------------ */

function computeBankTotalFromData(
  accounts: Array<{
    id: string
    profile_id: string | null
    opening_balance: number | null
    locked_amount: number | null
  }>,
  primaryAccountByProfile: Map<string, string>,
  snapshots: Array<{
    account_id: string
    month: string
    closing_balance: number
    is_reconciliation: boolean
  }>,
  giroDebitByAccount: Map<string, number>,
  giroCreditByAccount: Map<string, number>,
  targetMonth: string,
  cashflowByKey: Map<string, CashflowRow>,
  profileById: Map<string, ProfileData>,
  incomeByProfileId: Map<string, IncomeData>,
  giroByProfile: Map<string, number>,
  insuranceByProfile: Map<string, InsurancePolicy[]>,
  ilpByProfile: Map<
    string,
    Array<{ monthly_premium: number; premium_payment_mode?: string | null }>
  >,
  loansByProfile: Map<
    string,
    Array<{ principal: number; rate_pct: number; tenure_months: number; use_cpf_oa?: boolean; start_date?: string | null }>
  >,
  savingsGoalsByProfile: Map<string, number>,
  taxReliefByProfileYear: Map<
    string,
    Array<{ relief_type: string; amount: number }>
  >,
  taxEntryByProfileYear?: Map<string, TaxEntryData>,
): number {
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
          parseInt(monthStr.slice(0, 4), 10) || new Date().getFullYear()

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
    sharedIlpRes,
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
      .select("profile_id, month, inflow, outflow")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"])
      .gte("month", rangeStart)
      .order("month", { ascending: false }),
    // 2. Profiles
    supabase
      .from("profiles")
      .select("id, birth_year, name, primary_bank_account_id, self_help_group")
      .in("id", profileIds.length > 0 ? profileIds : ["__none__"]),
    // 3. Income config
    supabase
      .from("income_config")
      .select("profile_id, annual_salary, bonus_estimate")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
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
        "profile_id, premium_amount, frequency, is_active, deduct_from_outflow, type, coverage_amount, end_date"
      )
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
    // 6. ILP products (profile-scoped)
    supabase
      .from("ilp_products")
      .select("profile_id, monthly_premium, premium_payment_mode")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
    // 7. Loans (with extra fields for outstanding principal)
    supabase
      .from("loans")
      .select("id, profile_id, principal, rate_pct, tenure_months, start_date, use_cpf_oa")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
    // 8. Tax relief inputs
    supabase
      .from("tax_relief_inputs")
      .select("profile_id, year, relief_type, amount")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"])
      .in("year", [currentYear, currentYear - 1]),
    // 9. Shared ILP products (family-level)
    supabase
      .from("ilp_products")
      .select("monthly_premium, premium_payment_mode")
      .eq("family_id", familyId)
      .is("profile_id", null),
    // 10. Savings goals
    supabase
      .from("savings_goals")
      .select("profile_id, monthly_auto_amount")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
    // 11. CPF balances
    supabase
      .from("cpf_balances")
      .select("profile_id, month, oa, sa, ma")
      .in(
        "profile_id",
        targetProfileIds.length > 0 ? targetProfileIds : ["__none__"]
      )
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
    .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"])
    .in("year", [currentYear, currentYear - 1])

  const taxEntryByProfileYear = new Map<string, TaxEntryData>()
  for (const te of taxEntriesData ?? []) {
    taxEntryByProfileYear.set(`${te.profile_id}:${te.year}`, {
      actual_amount: te.actual_amount,
    })
  }

  // ── Build lookup maps ──
  const cashflowByKey = new Map<string, CashflowRow>()
  for (const row of cashflowRes.data ?? []) {
    const m = normalizeMonthKey(row.month as string)
    const key = `${row.profile_id}:${m}`
    // Keep the first (latest) entry per key since ordered desc
    if (!cashflowByKey.has(key)) {
      cashflowByKey.set(key, { inflow: row.inflow, outflow: row.outflow })
    }
  }

  const profileById = new Map<string, ProfileData & { name: string }>()
  const primaryAccountByProfile = new Map<string, string>()
  for (const p of profilesRes.data ?? []) {
    profileById.set(p.id, { birth_year: p.birth_year, name: p.name, self_help_group: p.self_help_group })
    if (p.primary_bank_account_id) {
      primaryAccountByProfile.set(p.id, p.primary_bank_account_id)
    }
  }

  const incomeByProfileId = new Map<string, IncomeData>()
  for (const ic of incomeRes.data ?? []) {
    incomeByProfileId.set(ic.profile_id, {
      annual_salary: ic.annual_salary,
      bonus_estimate: ic.bonus_estimate,
    })
  }

  // GIRO outflow by profile (for cashflow aggregation)
  const giroAccountIds = [
    ...new Set((giroRulesRes.data ?? []).map((r) => r.source_bank_account_id)),
  ]
  const giroAccounts = (bankAccountsRes.data ?? []).filter((a) =>
    giroAccountIds.includes(a.id)
  )
  const giroByProfile = buildGiroOutflowByProfile(
    giroRulesRes.data ?? [],
    giroAccounts,
    profileIds
  )

  // Insurance by profile (filter active, unexpired for outflow)
  const nowDate = new Date().toISOString().slice(0, 10)
  const insuranceByProfile = new Map<string, InsurancePolicy[]>()
  for (const pol of insuranceRes.data ?? []) {
    const pid = pol.profile_id as string
    // Skip expired policies
    if (pol.end_date && pol.end_date < nowDate) continue
    const list = insuranceByProfile.get(pid) ?? []
    list.push({
      premium_amount: pol.premium_amount,
      frequency: pol.frequency,
      is_active: pol.is_active,
      deduct_from_outflow: pol.deduct_from_outflow,
      type: pol.type,
      coverage_amount: pol.coverage_amount,
    })
    insuranceByProfile.set(pid, list)
  }

  const ilpByProfile = new Map<
    string,
    Array<{ monthly_premium: number; premium_payment_mode?: string | null }>
  >()
  for (const row of ilpRes.data ?? []) {
    const pid = row.profile_id as string
    const list = ilpByProfile.get(pid) ?? []
    list.push({
      monthly_premium: row.monthly_premium,
      premium_payment_mode: row.premium_payment_mode,
    })
    ilpByProfile.set(pid, list)
  }

  const loansByProfile = new Map<
    string,
    Array<{
      id: string
      principal: number
      rate_pct: number
      tenure_months: number
      start_date: string
      use_cpf_oa: boolean
    }>
  >()
  for (const row of loansRes.data ?? []) {
    const pid = row.profile_id as string
    const list = loansByProfile.get(pid) ?? []
    list.push({
      id: row.id,
      principal: row.principal,
      rate_pct: row.rate_pct,
      tenure_months: row.tenure_months,
      start_date: row.start_date,
      use_cpf_oa: !!row.use_cpf_oa,
    })
    loansByProfile.set(pid, list)
  }

  // For cashflow aggregation, we need loans without id
  const loansForCashflow = new Map<
    string,
    Array<{ principal: number; rate_pct: number; tenure_months: number; use_cpf_oa?: boolean; start_date?: string | null }>
  >()
  for (const [pid, loans] of loansByProfile) {
    loansForCashflow.set(
      pid,
      loans.map((l) => ({
        principal: l.principal,
        rate_pct: l.rate_pct,
        tenure_months: l.tenure_months,
        use_cpf_oa: l.use_cpf_oa,
        start_date: l.start_date,
      }))
    )
  }

  const taxReliefByProfileYear = new Map<
    string,
    Array<{ relief_type: string; amount: number }>
  >()
  for (const tr of taxReliefRes.data ?? []) {
    const key = `${tr.profile_id}:${tr.year}`
    const list = taxReliefByProfileYear.get(key) ?? []
    list.push({ relief_type: tr.relief_type, amount: tr.amount })
    taxReliefByProfileYear.set(key, list)
  }

  const savingsGoalsByProfile = new Map<string, number>()
  for (const g of savingsGoalsRes.data ?? []) {
    const pid = g.profile_id as string
    const amt = (g.monthly_auto_amount as number) ?? 0
    savingsGoalsByProfile.set(pid, (savingsGoalsByProfile.get(pid) ?? 0) + amt)
  }

  const sharedIlp = sumIlpPremiums(sharedIlpRes.data)

  // ── Bank Total ──
  const filteredBankAccounts = profileId
    ? (bankAccountsRes.data ?? []).filter(
        (a) =>
          a.family_id === familyId &&
          (a.profile_id === profileId || a.profile_id === null)
      )
    : (bankAccountsRes.data ?? []).filter((a) => a.family_id === familyId)

  // Build GIRO debit/credit maps per bank account
  const giroDebitByAccount = new Map<string, number>()
  const giroCreditByAccount = new Map<string, number>()
  for (const rule of giroAllRulesRes.data ?? []) {
    const debitId = rule.source_bank_account_id
    giroDebitByAccount.set(
      debitId,
      (giroDebitByAccount.get(debitId) ?? 0) + rule.amount
    )
    if (
      rule.destination_type === "bank_account" &&
      rule.destination_bank_account_id
    ) {
      const creditId = rule.destination_bank_account_id as string
      giroCreditByAccount.set(
        creditId,
        (giroCreditByAccount.get(creditId) ?? 0) + rule.amount
      )
    }
  }

  // Filter snapshots to only relevant accounts
  const bankAccountIds = new Set(filteredBankAccounts.map((a) => a.id))
  const relevantSnapshots = (snapshotsRes.data ?? []).filter((s) =>
    bankAccountIds.has(s.account_id)
  )

  const bankTotal = computeBankTotalFromData(
    filteredBankAccounts,
    primaryAccountByProfile,
    relevantSnapshots,
    giroDebitByAccount,
    giroCreditByAccount,
    targetMonth,
    cashflowByKey,
    profileById,
    incomeByProfileId,
    giroByProfile,
    insuranceByProfile,
    ilpByProfile,
    loansForCashflow,
    savingsGoalsByProfile,
    taxReliefByProfileYear,
    taxEntryByProfileYear,
  )

  // ── CPF Total ──
  function getCpfForMonth(month: string | null): {
    total: number
    oa: number
    sa: number
    ma: number
  } {
    let total = 0
    let oa = 0
    let sa = 0
    let ma = 0

    for (const pid of targetProfileIds) {
      // Find latest CPF balance <= month for this profile
      const cpfEntries = (cpfRes.data ?? []).filter(
        (c) => c.profile_id === pid && (month == null || c.month <= month)
      )
      // Already sorted desc by month from query
      const latest = cpfEntries[0]

      if (latest) {
        const o = latest.oa ?? 0
        const s = latest.sa ?? 0
        const m = latest.ma ?? 0
        oa += o
        sa += s
        ma += m
        total += o + s + m
      } else {
        // Project from income
        const profile = profileById.get(pid)
        const incomeConfig = incomeByProfileId.get(pid)
        if (profile && incomeConfig && incomeConfig.annual_salary > 0) {
          const refDate = month ? new Date(month) : new Date()
          const refYear = refDate.getFullYear()
          const age = getAge(profile.birth_year, refYear)
          const monthlyGross = incomeConfig.annual_salary / 12
          const contribution = calculateCpfContribution(
            monthlyGross,
            age,
            refYear
          )
          const monthsElapsed = refDate.getMonth() + 1
          const o = contribution.oa * monthsElapsed
          const s = contribution.sa * monthsElapsed
          const m = contribution.ma * monthsElapsed
          oa += o
          sa += s
          ma += m
          total += o + s + m
        }
      }
    }

    return { total, oa, sa, ma }
  }

  // Determine CPF reference month
  let cpfReferenceMonth: string | null = monthFilter
    ? normalizeMonthKey(monthFilter)
    : null
  if (!cpfReferenceMonth && targetProfileIds.length > 0) {
    const latestCpf = (cpfRes.data ?? []).find((c) =>
      targetProfileIds.includes(c.profile_id)
    )
    cpfReferenceMonth = latestCpf?.month ?? null
  }

  const cpfCurrent = getCpfForMonth(cpfReferenceMonth)
  let cpfDelta: number | undefined
  if (cpfReferenceMonth) {
    const prevMonth = getPreviousMonth(cpfReferenceMonth)
    const cpfPrevious = getCpfForMonth(prevMonth)
    cpfDelta = cpfCurrent.total - cpfPrevious.total
  }

  // ── Investments ──
  const { netLiquidValue, ilpFundTotal, investmentTotal } = investmentsResult

  // ── Loans ──
  let loanTotal = 0
  let loanMonthlyTotal = 0
  let loanRemainingMonths = 0

  // Collect all loan IDs for repayment queries
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

  if (allLoans.length > 0) {
    const loanIds = allLoans.map((l) => l.id)
    const [{ data: repayments }, { data: earlyRepayments }] = await Promise.all(
      [
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
      ]
    )

    for (const loan of allLoans) {
      loanMonthlyTotal += loanMonthlyPayment(
        loan.principal,
        loan.rate_pct,
        loan.tenure_months
      )
      const remaining = getRemainingMonths(loan.start_date, loan.tenure_months)
      if (remaining > loanRemainingMonths) {
        loanRemainingMonths = remaining
      }

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
        loanEarlyRepayments
      )
    }
  }

  // ── Savings Rate ──
  let savingsRate = 0
  let latestInflow = 0
  let latestOutflow = 0
  let latestMonth: string | null = null
  let previousMonthInflow: number | undefined
  let previousMonthOutflow: number | undefined
  let previousMonthSavings: number | undefined

  if (monthFilter) {
    latestMonth = normalizeMonthKey(monthFilter)
    const cf = computeCashflowForMonth(
      latestMonth,
      profileIds,
      cashflowByKey,
      profileById,
      incomeByProfileId,
      giroByProfile,
      insuranceByProfile,
      ilpByProfile,
      loansForCashflow,
      savingsGoalsByProfile,
      taxReliefByProfileYear,
      sharedIlp,
      taxEntryByProfileYear,
    )
    latestInflow = cf.inflow
    latestOutflow = cf.outflow
    savingsRate = calculateSavingsRate(cf.inflow, cf.outflow)

    const prevMonth = getPreviousMonth(latestMonth)
    const prevCf = computeCashflowForMonth(
      prevMonth,
      profileIds,
      cashflowByKey,
      profileById,
      incomeByProfileId,
      giroByProfile,
      insuranceByProfile,
      ilpByProfile,
      loansForCashflow,
      savingsGoalsByProfile,
      taxReliefByProfileYear,
      sharedIlp,
      taxEntryByProfileYear,
    )
    previousMonthInflow = prevCf.inflow
    previousMonthOutflow = prevCf.outflow
    previousMonthSavings = prevCf.inflow - prevCf.outflow
  } else {
    // Find the latest month with cashflow data
    const cashflowRows = cashflowRes.data ?? []
    const relevantRows = profileId
      ? cashflowRows.filter((r) => r.profile_id === profileId)
      : cashflowRows.filter((r) => profileIds.includes(r.profile_id))

    if (relevantRows.length > 0) {
      // Already sorted desc
      latestMonth = normalizeMonthKey(relevantRows[0]!.month as string)

      const cf = computeCashflowForMonth(
        latestMonth,
        profileIds,
        cashflowByKey,
        profileById,
        incomeByProfileId,
        giroByProfile,
        insuranceByProfile,
        ilpByProfile,
        loansForCashflow,
        savingsGoalsByProfile,
        taxReliefByProfileYear,
        sharedIlp
      )
      latestInflow = cf.inflow
      latestOutflow = cf.outflow
      savingsRate = calculateSavingsRate(cf.inflow, cf.outflow)
    }
  }

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
    ...(cpfDelta !== undefined ? { cpfDelta: round(cpfDelta) } : {}),
    netLiquidValue: round(netLiquidValue),
    ilpFundTotal: round(ilpFundTotal),
    investmentTotal: round(investmentTotal),
    loanTotal: round(loanTotal),
    loanMonthlyTotal: round(loanMonthlyTotal),
    loanRemainingMonths,
    liquidNetWorth: round(liquidNetWorth),
    totalNetWorth: round(totalNetWorth),
    savingsRate: round(savingsRate),
    latestInflow: round(latestInflow),
    latestOutflow: round(latestOutflow),
    latestMonth,
    ...(previousMonthInflow !== undefined
      ? { previousMonthInflow: round(previousMonthInflow) }
      : {}),
    ...(previousMonthOutflow !== undefined
      ? { previousMonthOutflow: round(previousMonthOutflow) }
      : {}),
    ...(previousMonthSavings !== undefined
      ? { previousMonthSavings: round(previousMonthSavings) }
      : {}),
  }
}
