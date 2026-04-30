/**
 * Batched cashflow series for a month range: fixed small number of Supabase round-trips,
 * then synchronous per-(profile, month) aggregation. Mirrors getEffectiveInflowForProfile /
 * getEffectiveOutflowForProfile without N×M query waterfalls.
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
  sumEarlyRepaymentsForMonth,
  sumGoalContributionsForMonth,
  sumOneTimeIlpForMonth,
  sumTaxReliefCashForMonth,
  sumNetInvestmentPurchasesForMonth,
  yearsInMonths,
  GIRO_OUTFLOW_DESTINATIONS,
  type TaxEntryData,
} from "@/lib/api/cashflow-aggregation"
import { decodeIncomeConfigPii } from "@/lib/repos/income-config"
import { decodeInsurancePoliciesPii } from "@/lib/repos/insurance-policies"
import { decodeLoanPii } from "@/lib/repos/loans"
import { decodeMonthlyCashflowPii } from "@/lib/repos/monthly-cashflow"
import { decodeTaxReliefInputsPii } from "@/lib/repos/tax-relief-inputs"

export type CashflowRangeRow = {
  month: string
  inflow: number
  discretionary: number
  insurance: number
  ilp: number
  ilpOneTime: number
  loans: number
  earlyRepayments: number
  tax: number
  taxReliefCash: number
  savingsGoals: number
  investments: number
  totalOutflow: number
  /** Aggregated Telegram/dashboard notes for the month (per profile). */
  inflowMemo?: string
  outflowMemo?: string
}

function throwIfAnyError(results: { error: { message: string } | null }[]): void {
  for (const r of results) {
    if (r.error) throw new Error(r.error.message)
  }
}

type CashflowRangeLookups = {
  cashflowByKey: Map<string, { inflow: number | null; outflow: number | null }>
  profileById: Map<string, { birth_year: number; name: string; self_help_group?: string }>
  incomeByProfileId: Map<string, { annual_salary: number; bonus_estimate: number | null }>
  giroByProfile: ReturnType<typeof buildGiroOutflowByProfile>
  insuranceByProfile: Map<
    string,
    Array<{
      premium_amount: number
      frequency: string
      is_active: boolean | null
      deduct_from_outflow: boolean | null
      type: string
      coverage_amount: number | null
    }>
  >
  ilpByProfile: Map<
    string,
    Array<{ monthly_premium: number; premium_payment_mode?: string | null }>
  >
  loansByProfile: Map<
    string,
    Array<{
      principal: number
      rate_pct: number
      tenure_months: number
      use_cpf_oa?: boolean
      start_date?: string | null
    }>
  >
  taxReliefByProfileYear: Map<string, Array<{ relief_type: string; amount: number }>>
  savingsGoalsByProfile: Map<string, number>
  earlyRepaymentsByProfile: Map<
    string,
    Array<{ amount: number; penalty_amount: number | null; date: string }>
  >
  goalContribsByProfile: Map<string, Array<{ amount: number; created_at: string }>>
  oneTimeIlpByProfile: Map<string, Array<{ monthly_premium: number; created_at: string }>>
  investmentTxnsByProfile: Map<
    string,
    Array<{ type: string; quantity: number; price: number; created_at: string }>
  >
  taxReliefCashByProfileYear: Map<
    string,
    Array<{ relief_type: string; amount: number; year: number }>
  >
  taxEntryByProfileYear: Map<string, TaxEntryData>
  inflowMemoByKey: Map<string, string>
  outflowMemoByKey: Map<string, string>
  sharedIlp: number
}

type MonthBuckets = {
  inflow: number
  discretionary: number
  insurance: number
  ilp: number
  ilpOneTime: number
  loans: number
  earlyRepayments: number
  tax: number
  taxReliefCash: number
  savingsGoals: number
  investments: number
}

function aggregateProfileMonth(
  buckets: MonthBuckets,
  pid: string,
  monthStr: string,
  year: number,
  L: CashflowRangeLookups,
): void {
  buckets.inflow += effectiveInflowFromContext(
    pid,
    monthStr,
    year,
    L.cashflowByKey,
    L.profileById,
    L.incomeByProfileId,
  )
  buckets.discretionary += discretionaryForProfileMonth(
    pid,
    monthStr,
    L.cashflowByKey,
    L.giroByProfile,
  )

  const pols = L.insuranceByProfile.get(pid) ?? []
  const insSplit = sumInsuranceOutflowPremiumsSplit(pols)
  buckets.insurance += insSplit.insurance
  buckets.ilp += insSplit.ilpFromLegacyPolicies
  buckets.ilp += sumIlpPremiums(L.ilpByProfile.get(pid) ?? [])

  buckets.loans += sumLoanMonthlyPayments(L.loansByProfile.get(pid) ?? [], monthStr)

  buckets.savingsGoals += L.savingsGoalsByProfile.get(pid) ?? 0
  buckets.savingsGoals += sumGoalContributionsForMonth(
    L.goalContribsByProfile.get(pid) ?? [],
    monthStr,
  )

  buckets.earlyRepayments += sumEarlyRepaymentsForMonth(
    L.earlyRepaymentsByProfile.get(pid) ?? [],
    monthStr,
  )

  buckets.ilpOneTime += sumOneTimeIlpForMonth(
    L.oneTimeIlpByProfile.get(pid) ?? [],
    monthStr,
  )

  buckets.taxReliefCash += sumTaxReliefCashForMonth(
    L.taxReliefCashByProfileYear.get(`${pid}:${year}`) ?? [],
    year,
  )

  buckets.investments += sumNetInvestmentPurchasesForMonth(
    L.investmentTxnsByProfile.get(pid) ?? [],
    monthStr,
  )

  buckets.tax += monthlyTaxForProfile(
    pid,
    year,
    L.profileById,
    L.incomeByProfileId,
    pols,
    L.taxReliefByProfileYear.get(`${pid}:${year}`) ?? [],
    L.taxEntryByProfileYear,
  )
}

function buildMemoStrings(
  profileIds: string[],
  monthStr: string,
  L: CashflowRangeLookups,
): { inflowMemo?: string; outflowMemo?: string } {
  const inflowParts: string[] = []
  const outflowParts: string[] = []
  for (const pid of profileIds) {
    const memoKey = `${pid}:${monthStr}`
    const pname = L.profileById.get(pid)?.name ?? "Member"
    const im = L.inflowMemoByKey.get(memoKey)
    if (im) inflowParts.push(`${pname}: ${im}`)
    const om = L.outflowMemoByKey.get(memoKey)
    if (om) outflowParts.push(`${pname}: ${om}`)
  }
  const out: { inflowMemo?: string; outflowMemo?: string } = {}
  if (inflowParts.length > 0) out.inflowMemo = inflowParts.join(" · ")
  if (outflowParts.length > 0) out.outflowMemo = outflowParts.join(" · ")
  return out
}

function buildMonthRow(
  month: string,
  profileIds: string[],
  L: CashflowRangeLookups,
): CashflowRangeRow {
  const monthStr = normalizeMonthKey(month)
  const year = Number.parseInt(monthStr.slice(0, 4), 10) || new Date().getFullYear()

  const buckets: MonthBuckets = {
    inflow: 0,
    discretionary: 0,
    insurance: 0,
    ilp: 0,
    ilpOneTime: 0,
    loans: 0,
    earlyRepayments: 0,
    tax: 0,
    taxReliefCash: 0,
    savingsGoals: 0,
    investments: 0,
  }
  for (const pid of profileIds) {
    aggregateProfileMonth(buckets, pid, monthStr, year, L)
  }
  buckets.ilp += L.sharedIlp

  const totalOutflow =
    buckets.discretionary +
    buckets.insurance +
    buckets.ilp +
    buckets.ilpOneTime +
    buckets.loans +
    buckets.earlyRepayments +
    buckets.tax +
    buckets.taxReliefCash +
    buckets.savingsGoals +
    buckets.investments

  return {
    month,
    ...buckets,
    totalOutflow,
    ...buildMemoStrings(profileIds, monthStr, L),
  }
}

export function getMonthsInRange(
  startMonth: string,
  endMonth: string
): string[] {
  const months: string[] = []
  const [startY, startM] = startMonth.split("-").map(Number)
  const [endY, endM] = endMonth.split("-").map(Number)
  let y = startY
  let m = startM
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, "0")}-01`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return months
}

/**
 * Loads all data for the range in parallel, then aggregates months synchronously.
 */
export async function fetchCashflowRangeSeries(
  supabase: SupabaseClient,
  params: {
    profileIds: string[]
    familyId: string
    startMonth: string
    endMonth: string
  }
): Promise<CashflowRangeRow[]> {
  const { profileIds, familyId, startMonth, endMonth } = params
  const months = getMonthsInRange(startMonth, endMonth)
  if (months.length === 0) return []

  if (profileIds.length === 0) {
    const { data: sharedRows } = await supabase
      .from("ilp_products")
      .select("monthly_premium, premium_payment_mode")
      .eq("family_id", familyId)
      .is("profile_id", null)
    const sharedIlp = sumIlpPremiums(sharedRows)
    return months.map((month) => ({
      month,
      inflow: 0,
      discretionary: 0,
      insurance: 0,
      ilp: sharedIlp,
      ilpOneTime: 0,
      loans: 0,
      earlyRepayments: 0,
      tax: 0,
      taxReliefCash: 0,
      savingsGoals: 0,
      investments: 0,
      totalOutflow: sharedIlp,
      inflowMemo: undefined,
      outflowMemo: undefined,
    }))
  }

  const years = yearsInMonths(months)

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
    goalContributionsRes,
    oneTimeIlpRes,
    investmentTxnsRes,
  ] = await Promise.all([
    supabase
      .from("monthly_cashflow")
      .select(
        "profile_id, month, inflow_enc, outflow_enc, inflow_memo, outflow_memo",
      )
      .in("profile_id", profileIds)
      .gte("month", startMonth)
      .lte("month", endMonth),
    supabase
      .from("profiles")
      .select("id, birth_year, name, self_help_group")
      .in("id", profileIds),
    supabase
      .from("income_config")
      .select("profile_id, annual_salary_enc, bonus_estimate_enc")
      .in("profile_id", profileIds),
    supabase
      .from("giro_rules")
      .select("id, amount, source_bank_account_id, linked_entity_type")
      .eq("is_active", true)
      .in("destination_type", [...GIRO_OUTFLOW_DESTINATIONS]),
    supabase
      .from("insurance_policies")
      .select(
        "profile_id, premium_amount_enc, frequency, is_active, deduct_from_outflow, type, coverage_amount_enc",
      )
      .in("profile_id", profileIds),
    supabase
      .from("ilp_products")
      .select("profile_id, monthly_premium, premium_payment_mode")
      .in("profile_id", profileIds),
    supabase
      .from("loans")
      .select("id, profile_id, principal, principal_enc, rate_pct, tenure_months, start_date, use_cpf_oa")
      .in("profile_id", profileIds),
    supabase
      .from("tax_relief_inputs")
      .select("profile_id, year, relief_type, amount_enc")
      .in("profile_id", profileIds)
      .in("year", years.length ? years : [new Date().getFullYear()]),
    supabase
      .from("ilp_products")
      .select("monthly_premium, premium_payment_mode")
      .eq("family_id", familyId)
      .is("profile_id", null),
    supabase
      .from("savings_goals")
      .select("id, profile_id, monthly_auto_amount")
      .in("profile_id", profileIds),
    // Goal contributions for the date range
    supabase
      .from("goal_contributions")
      .select("goal_id, amount, created_at")
      .gte("created_at", startMonth)
      .lte("created_at", endMonth + "T23:59:59"),
    // One-time ILP products (need created_at for month matching)
    supabase
      .from("ilp_products")
      .select("profile_id, monthly_premium, created_at")
      .in("profile_id", profileIds)
      .eq("premium_payment_mode", "one_time"),
    // Investment transactions for the date range
    supabase
      .from("investment_transactions")
      .select("profile_id, type, quantity, price, created_at")
      .eq("family_id", familyId)
      .in("type", ["buy", "sell"])
      .gte("created_at", startMonth)
      .lte("created_at", endMonth + "T23:59:59"),
  ])

  throwIfAnyError([
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
    goalContributionsRes,
    oneTimeIlpRes,
    investmentTxnsRes,
  ])

  // Fetch tax entries (actual_amount) for the years in range
  const { data: taxEntriesData } = await supabase
    .from("tax_entries")
    .select("profile_id, year, actual_amount")
    .in("profile_id", profileIds)
    .in("year", years.length ? years : [new Date().getFullYear()])

  const taxEntryByProfileYear = new Map<string, TaxEntryData>()
  for (const te of taxEntriesData ?? []) {
    taxEntryByProfileYear.set(`${te.profile_id}:${te.year}`, {
      actual_amount: te.actual_amount,
    })
  }

  // Fetch early repayments (needs loan IDs from loansRes)
  const allLoanIds = (loansRes.data ?? []).map((l) => l.id as string)
  const earlyRepaymentsData =
    allLoanIds.length > 0
      ? await supabase
          .from("loan_early_repayments")
          .select("loan_id, amount, penalty_amount, date")
          .in("loan_id", allLoanIds)
          .gte("date", startMonth)
          .lte("date", endMonth)
          .then((r) => r.data ?? [])
      : []

  // Build loan ID → profile ID map for early repayments
  const loanProfileMap = new Map<string, string>()
  for (const loan of loansRes.data ?? []) {
    loanProfileMap.set(loan.id as string, loan.profile_id as string)
  }

  // Group early repayments by profile
  const earlyRepaymentsByProfile = new Map<
    string,
    Array<{ amount: number; penalty_amount: number | null; date: string }>
  >()
  for (const er of earlyRepaymentsData) {
    const pid = loanProfileMap.get(er.loan_id)
    if (!pid) continue
    const list = earlyRepaymentsByProfile.get(pid) ?? []
    list.push({ amount: er.amount, penalty_amount: er.penalty_amount, date: er.date })
    earlyRepaymentsByProfile.set(pid, list)
  }

  // Build goal ID → profile ID map for contributions
  const goalProfileMap = new Map<string, string>()
  for (const g of savingsGoalsRes.data ?? []) {
    goalProfileMap.set(g.id as string, g.profile_id as string)
  }

  // Group goal contributions by profile
  const goalContribsByProfile = new Map<
    string,
    Array<{ amount: number; created_at: string }>
  >()
  for (const gc of goalContributionsRes.data ?? []) {
    const pid = goalProfileMap.get(gc.goal_id)
    if (!pid) continue
    const list = goalContribsByProfile.get(pid) ?? []
    list.push({ amount: gc.amount, created_at: gc.created_at })
    goalContribsByProfile.set(pid, list)
  }

  // Group one-time ILPs by profile
  const oneTimeIlpByProfile = new Map<
    string,
    Array<{ monthly_premium: number; created_at: string }>
  >()
  for (const ilpRow of oneTimeIlpRes.data ?? []) {
    const pid = ilpRow.profile_id as string
    const list = oneTimeIlpByProfile.get(pid) ?? []
    list.push({ monthly_premium: ilpRow.monthly_premium, created_at: ilpRow.created_at })
    oneTimeIlpByProfile.set(pid, list)
  }

  // Group investment transactions by profile
  const investmentTxnsByProfile = new Map<
    string,
    Array<{ type: string; quantity: number; price: number; created_at: string }>
  >()
  for (const txn of investmentTxnsRes.data ?? []) {
    const pid = txn.profile_id as string
    if (!pid) continue
    const list = investmentTxnsByProfile.get(pid) ?? []
    list.push({
      type: txn.type,
      quantity: txn.quantity,
      price: txn.price,
      created_at: txn.created_at,
    })
    investmentTxnsByProfile.set(pid, list)
  }

  // Tax relief cash by profile (keyed by profile:year)
  const taxReliefCashByProfileYear = new Map<
    string,
    Array<{ relief_type: string; amount: number; year: number }>
  >()
  for (const tr of taxReliefRes.data ?? []) {
    const key = `${tr.profile_id}:${tr.year}`
    const list = taxReliefCashByProfileYear.get(key) ?? []
    const amount = decodeTaxReliefInputsPii(tr).amount ?? 0
    list.push({ relief_type: tr.relief_type, amount, year: tr.year as number })
    taxReliefCashByProfileYear.set(key, list)
  }

  const accountIds = [
    ...new Set((giroRulesRes.data ?? []).map((r) => r.source_bank_account_id)),
  ]
  const { data: bankAccounts, error: bankErr } =
    accountIds.length > 0
      ? await supabase
          .from("bank_accounts")
          .select("id, profile_id")
          .in("id", accountIds)
      : {
          data: [] as Array<{ id: string; profile_id: string | null }>,
          error: null,
        }
  if (bankErr) throw new Error(bankErr.message)

  const cashflowByKey = new Map<
    string,
    { inflow: number | null; outflow: number | null }
  >()
  const inflowMemoByKey = new Map<string, string>()
  const outflowMemoByKey = new Map<string, string>()
  for (const row of cashflowRes.data ?? []) {
    const m = normalizeMonthKey(row.month as string)
    const key = `${row.profile_id}:${m}`
    const decoded = decodeMonthlyCashflowPii(row)
    cashflowByKey.set(key, {
      inflow: decoded.inflow,
      outflow: decoded.outflow,
    })
    const r = row as {
      profile_id: string
      month: string
      inflow_memo?: string | null
      outflow_memo?: string | null
    }
    if (r.inflow_memo?.trim()) {
      inflowMemoByKey.set(key, r.inflow_memo.trim())
    }
    if (r.outflow_memo?.trim()) {
      outflowMemoByKey.set(key, r.outflow_memo.trim())
    }
  }

  const profileById = new Map<string, { birth_year: number; name: string; self_help_group?: string }>()
  for (const p of profilesRes.data ?? []) {
    profileById.set(p.id, { birth_year: p.birth_year, name: p.name, self_help_group: p.self_help_group })
  }

  const incomeByProfileId = new Map<
    string,
    { annual_salary: number; bonus_estimate: number | null }
  >()
  for (const ic of incomeRes.data ?? []) {
    const decoded = decodeIncomeConfigPii(ic)
    incomeByProfileId.set(ic.profile_id, {
      annual_salary: decoded.annual_salary ?? 0,
      bonus_estimate: decoded.bonus_estimate ?? null,
    })
  }

  const giroByProfile = buildGiroOutflowByProfile(
    giroRulesRes.data ?? [],
    bankAccounts ?? [],
    profileIds
  )

  const insuranceByProfile = new Map<
    string,
    Array<{
      premium_amount: number
      frequency: string
      is_active: boolean | null
      deduct_from_outflow: boolean | null
      type: string
      coverage_amount: number | null
    }>
  >()
  for (const pol of insuranceRes.data ?? []) {
    const pid = pol.profile_id as string
    const list = insuranceByProfile.get(pid) ?? []
    const decoded = decodeInsurancePoliciesPii(pol)
    list.push({
      premium_amount: decoded.premium_amount ?? 0,
      frequency: pol.frequency,
      is_active: pol.is_active,
      deduct_from_outflow: pol.deduct_from_outflow,
      type: pol.type,
      coverage_amount: decoded.coverage_amount,
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
    Array<{ principal: number; rate_pct: number; tenure_months: number; use_cpf_oa?: boolean; start_date?: string | null }>
  >()
  for (const row of loansRes.data ?? []) {
    const pid = row.profile_id as string
    const list = loansByProfile.get(pid) ?? []
    list.push({
      principal: decodeLoanPii(row).principal ?? 0,
      rate_pct: row.rate_pct,
      tenure_months: row.tenure_months,
      use_cpf_oa: !!row.use_cpf_oa,
      start_date: row.start_date,
    })
    loansByProfile.set(pid, list)
  }

  const taxReliefByProfileYear = new Map<
    string,
    Array<{ relief_type: string; amount: number }>
  >()
  for (const tr of taxReliefRes.data ?? []) {
    const pid = tr.profile_id as string
    const y = tr.year as number
    const key = `${pid}:${y}`
    const list = taxReliefByProfileYear.get(key) ?? []
    list.push({
      relief_type: tr.relief_type,
      amount: decodeTaxReliefInputsPii(tr).amount ?? 0,
    })
    taxReliefByProfileYear.set(key, list)
  }

  // Savings goals: sum monthly_auto_amount by profile
  const savingsGoalsByProfile = new Map<string, number>()
  for (const g of savingsGoalsRes.data ?? []) {
    const pid = g.profile_id as string
    const amt = (g.monthly_auto_amount as number) ?? 0
    savingsGoalsByProfile.set(pid, (savingsGoalsByProfile.get(pid) ?? 0) + amt)
  }

  const sharedIlp = sumIlpPremiums(sharedIlpRes.data)

  const lookups: CashflowRangeLookups = {
    cashflowByKey,
    profileById,
    incomeByProfileId,
    giroByProfile,
    insuranceByProfile,
    ilpByProfile,
    loansByProfile,
    taxReliefByProfileYear,
    savingsGoalsByProfile,
    earlyRepaymentsByProfile,
    goalContribsByProfile,
    oneTimeIlpByProfile,
    investmentTxnsByProfile,
    taxReliefCashByProfileYear,
    taxEntryByProfileYear,
    inflowMemoByKey,
    outflowMemoByKey,
    sharedIlp,
  }

  return months.map((month) => buildMonthRow(month, profileIds, lookups))
}
