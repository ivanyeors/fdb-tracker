/**
 * Batched single-month cashflow with inflow/outflow breakdown.
 * Replaces the N+1 per-profile loop in the cashflow waterfall mode.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { calculateTakeHome } from "@/lib/calculations/take-home"
import type { SelfHelpGroup } from "@/lib/calculations/self-help-group"
import { computeBankTotal } from "@/lib/calculations/computed-bank-balance"
import { getAge, calculateCpfContribution } from "@/lib/calculations/cpf"
import type {
  InvestmentWaterfallSection,
  CpfWaterfallSection,
} from "@/components/dashboard/cashflow/waterfall-chart"
import {
  buildGiroOutflowByProfile,
  monthlyTaxForProfile,
  normalizeMonthKey,
  sumIlpPremiums,
  sumInsuranceOutflowPremiumsSplit,
  sumLoanMonthlyPayments,
  sumEarlyRepaymentsForMonth,
  sumGoalContributionsForMonth,
  sumOneTimeIlpForMonth,
  sumTaxReliefCashForMonth,
  rawNetDeploymentForMonth,
  GIRO_OUTFLOW_DESTINATIONS,
  type CashflowRow,
  type IncomeData,
  type InsurancePolicy,
  type ProfileData,
  type TaxEntryData,
} from "@/lib/api/cashflow-aggregation"
import { decodeCpfBalancesPii } from "@/lib/repos/cpf-balances"
import { decodeIncomeConfigPii } from "@/lib/repos/income-config"
import { decodeInsurancePoliciesPii } from "@/lib/repos/insurance-policies"
import { decodeLoanPii } from "@/lib/repos/loans"
import { decodeMonthlyCashflowPii } from "@/lib/repos/monthly-cashflow"
import { decodeTaxReliefInputsPii } from "@/lib/repos/tax-relief-inputs"

type SingleMonthResult = {
  month: string
  startingBankBalance?: number
  endingBankBalance?: number
  inflowTotal: number
  inflowBreakdown?: Record<string, number>
  outflowTotal: number
  outflowBreakdown: {
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
    giroTransfers: number
  }
  netSavings: number
  investments?: InvestmentWaterfallSection
  cpf?: CpfWaterfallSection
  subBreakdowns?: Record<string, Array<{ label: string; amount: number }>>
}

type SubItem = { label: string; amount: number }

type IlpProductRow = { name: string; monthly_premium: number; premium_payment_mode?: string | null }
type LoanRow = {
  name: string
  principal: number
  rate_pct: number
  tenure_months: number
  use_cpf_oa?: boolean
  start_date?: string | null
}
type SavingsGoalRow = { profile_id: string | null; name: string | null; monthly_auto_amount: number | null }
type EarlyRepaymentRow = { loan_id: string; amount: number; penalty_amount: number | null; date: string }
type GoalContributionRow = { goal_id: string; amount: number; created_at: string }
type OneTimeIlpRow = { profile_id: string | null; name: string | null; monthly_premium: number; created_at: string }
type InvestmentTxnRow = {
  profile_id: string | null
  symbol: string | null
  type: string
  quantity: number
  price: number
  commission?: number | null
  account_id?: string | null
  created_at: string
}
type DividendTxnRow = { profile_id: string | null; quantity: number; price: number }
type BankAccountInterestRow = { profile_id: string | null; opening_balance: number | null; interest_rate_pct: number | null }
type IlpEntryRow = { product_id: string; fund_value: number; month: string }
type InvSnapshotRow = { profile_id: string | null; date: string; total_value: number }
type CpfBalanceRow = {
  profile_id: string
  month: string
  oa_enc?: string | null
  sa_enc?: string | null
  ma_enc?: string | null
}
type TaxReliefRawRow = {
  profile_id: string
  year: number
  relief_type: string
  amount_enc?: string | null
}

type Accumulator = {
  inflowTotal: number
  inflowBreakdown: Record<string, number | undefined>
  discretionary: number
  giroTransfers: number
  insurance: number
  ilp: number
  ilpOneTime: number
  loans: number
  earlyRepayments: number
  tax: number
  taxReliefCash: number
  savingsGoals: number
  investments: number
  insuranceSub: SubItem[]
  ilpSub: SubItem[]
  ilpOneTimeSub: SubItem[]
  loansSub: SubItem[]
  earlyRepaymentsSub: SubItem[]
  savingsGoalsSub: SubItem[]
  investmentsByAccountAndSymbol: Map<string, Map<string, number>>
  taxReliefCashSub: SubItem[]
}

type Lookups = {
  cashflowByKey: Map<string, CashflowRow>
  profileById: Map<string, ProfileData>
  incomeByProfileId: Map<string, IncomeData>
  giroByProfile: Map<string, number>
  insuranceByProfile: Map<string, Array<InsurancePolicy & { name: string }>>
  ilpByProfile: Map<string, IlpProductRow[]>
  loansByProfile: Map<string, LoanRow[]>
  taxReliefByProfileYear: Map<string, Array<{ relief_type: string; amount: number }>>
  savingsGoalsByProfile: Map<string, number>
  loanProfileMap: Map<string, string>
  loanNameMap: Map<string, string>
  earlyRepaymentsByProfile: Map<string, Array<{ amount: number; penalty_amount: number | null; date: string }>>
  goalProfileMap: Map<string, string>
  goalNameMap: Map<string, string>
  goalContribsByProfile: Map<string, Array<{ amount: number; created_at: string }>>
  oneTimeIlpByProfile: Map<string, Array<{ name: string; monthly_premium: number; created_at: string }>>
  investmentTxnsByProfile: Map<string, Array<{ symbol: string; type: string; quantity: number; price: number; commission?: number; account_id?: string | null; created_at: string }>>
  taxEntryByProfileYear: Map<string, TaxEntryData>
  accountNameMap: Map<string, string>
}

type AggregationContext = {
  monthStr: string
  prevMonthStr: string
  year: number
  profileIds: string[]
  lookups: Lookups
  taxReliefRows: TaxReliefRawRow[]
  earlyRepaymentRows: EarlyRepaymentRow[]
  savingsGoalRows: SavingsGoalRow[]
  ilpEntriesStart: IlpEntryRow[]
  ilpEntriesEnd: IlpEntryRow[]
  invSnapshotStart: InvSnapshotRow[]
  invSnapshotEnd: InvSnapshotRow[]
  cpfBalanceRows: CpfBalanceRow[]
  sharedIlpRows: IlpProductRow[]
}

const CASH_RELIEF_LABELS: Record<string, string> = {
  srs: "SRS",
  cpf_topup_self: "CPF Top-up (Self)",
  cpf_topup_family: "CPF Top-up (Family)",
}

function makeAccumulator(): Accumulator {
  return {
    inflowTotal: 0,
    inflowBreakdown: {},
    discretionary: 0,
    giroTransfers: 0,
    insurance: 0,
    ilp: 0,
    ilpOneTime: 0,
    loans: 0,
    earlyRepayments: 0,
    tax: 0,
    taxReliefCash: 0,
    savingsGoals: 0,
    investments: 0,
    insuranceSub: [],
    ilpSub: [],
    ilpOneTimeSub: [],
    loansSub: [],
    earlyRepaymentsSub: [],
    savingsGoalsSub: [],
    investmentsByAccountAndSymbol: new Map(),
    taxReliefCashSub: [],
  }
}

/* ------------------------------------------------------------------ */
/*  Data fetch                                                          */
/* ------------------------------------------------------------------ */

type FetchedData = {
  cashflowRows: Array<Record<string, unknown>>
  profileRows: Array<{ id: string; birth_year: number; name: string | null; self_help_group: string | null }>
  incomeRows: Array<Record<string, unknown>>
  giroRules: Array<{ id: string; amount: number; source_bank_account_id: string; linked_entity_type: string | null }>
  insuranceRows: Array<Record<string, unknown>>
  ilpRows: Array<Record<string, unknown>>
  loansRows: Array<Record<string, unknown>>
  taxReliefRows: TaxReliefRawRow[]
  sharedIlpRows: Array<{ id: string; name: string | null; monthly_premium: number; premium_payment_mode: string | null }>
  savingsGoalRows: Array<Record<string, unknown>>
  earlyRepaymentRows: EarlyRepaymentRow[]
  goalContributionRows: GoalContributionRow[]
  oneTimeIlpRows: OneTimeIlpRow[]
  investmentTxnRows: InvestmentTxnRow[]
  bankAccountsForInterest: BankAccountInterestRow[]
  dividendTxnRows: DividendTxnRow[]
  invSnapshotStart: InvSnapshotRow[]
  invSnapshotEnd: InvSnapshotRow[]
  cpfBalanceRows: CpfBalanceRow[]
  ilpEntriesStart: IlpEntryRow[]
  ilpEntriesEnd: IlpEntryRow[]
  taxEntryRows: Array<{ profile_id: string; year: number; actual_amount: number | null }>
  investmentAccountRows: Array<{ id: string; account_name: string }>
}

async function fetchPrimaryBatch(
  supabase: SupabaseClient,
  profileIds: string[],
  familyId: string,
  monthStr: string,
  year: number,
) {
  const inIds = profileIds.length > 0 ? profileIds : ["__none__"]
  return Promise.all([
    supabase
      .from("monthly_cashflow")
      .select("profile_id, month, inflow_enc, outflow_enc")
      .in("profile_id", inIds)
      .eq("month", monthStr),
    supabase
      .from("profiles")
      .select("id, birth_year, name, self_help_group")
      .in("id", inIds),
    supabase
      .from("income_config")
      .select("profile_id, annual_salary_enc, bonus_estimate_enc")
      .in("profile_id", inIds),
    supabase
      .from("giro_rules")
      .select("id, amount, source_bank_account_id, linked_entity_type")
      .eq("is_active", true)
      .in("destination_type", [...GIRO_OUTFLOW_DESTINATIONS]),
    supabase
      .from("insurance_policies")
      .select(
        "profile_id, name, premium_amount_enc, frequency, is_active, deduct_from_outflow, type, coverage_amount_enc, end_date",
      )
      .in("profile_id", inIds),
    supabase
      .from("ilp_products")
      .select("id, profile_id, name, monthly_premium, premium_payment_mode")
      .in("profile_id", inIds),
    supabase
      .from("loans")
      .select("id, profile_id, name, principal, principal_enc, rate_pct, tenure_months, start_date, use_cpf_oa")
      .in("profile_id", inIds),
    supabase
      .from("tax_relief_inputs")
      .select("profile_id, year, relief_type, amount_enc")
      .in("profile_id", inIds)
      .eq("year", year),
    supabase
      .from("ilp_products")
      .select("id, name, monthly_premium, premium_payment_mode")
      .eq("family_id", familyId)
      .is("profile_id", null),
    supabase
      .from("savings_goals")
      .select("id, profile_id, name, monthly_auto_amount")
      .in("profile_id", inIds),
  ])
}

async function fetchSecondaryBatch(
  supabase: SupabaseClient,
  profileIds: string[],
  familyId: string,
  monthStr: string,
  nextMonthStr: string,
  prevMonthStr: string,
  allLoanIds: string[],
  allGoalIds: string[],
  allIlpProductIds: string[],
) {
  const inIds = profileIds.length > 0 ? profileIds : ["__none__"]
  const buildTxnQuery = (type: "buy_sell" | "dividend") => {
    let q =
      type === "dividend"
        ? supabase
            .from("investment_transactions")
            .select("profile_id, quantity, price")
            .eq("family_id", familyId)
            .eq("type", "dividend")
            .gte("created_at", monthStr)
            .lt("created_at", nextMonthStr)
        : supabase
            .from("investment_transactions")
            .select("profile_id, symbol, type, quantity, price, commission, account_id, created_at")
            .eq("family_id", familyId)
            .in("type", ["buy", "sell"])
            .gte("created_at", monthStr)
            .lt("created_at", nextMonthStr)
    if (profileIds.length === 1) q = q.eq("profile_id", profileIds[0])
    return q
  }

  const buildSnapshotQuery = (boundary: string) => {
    if (profileIds.length === 1) {
      return supabase
        .from("investment_snapshots")
        .select("profile_id, date, total_value")
        .eq("family_id", familyId)
        .eq("profile_id", profileIds[0])
        .lt("date", boundary)
        .order("date", { ascending: false })
        .limit(1)
    }
    return supabase
      .from("investment_snapshots")
      .select("profile_id, date, total_value")
      .eq("family_id", familyId)
      .in("profile_id", inIds)
      .lt("date", boundary)
      .order("date", { ascending: false })
  }

  const buildIlpEntriesQuery = (boundary: string) =>
    allIlpProductIds.length > 0
      ? supabase
          .from("ilp_entries")
          .select("product_id, fund_value, month")
          .in("product_id", allIlpProductIds)
          .lt("month", boundary)
          .order("month", { ascending: false })
      : Promise.resolve({ data: [] as IlpEntryRow[], error: null })

  return Promise.all([
    allLoanIds.length > 0
      ? supabase
          .from("loan_early_repayments")
          .select("loan_id, amount, penalty_amount, date")
          .in("loan_id", allLoanIds)
          .gte("date", monthStr)
          .lt("date", nextMonthStr)
      : Promise.resolve({ data: [] as EarlyRepaymentRow[], error: null }),
    allGoalIds.length > 0
      ? supabase
          .from("goal_contributions")
          .select("goal_id, amount, created_at")
          .in("goal_id", allGoalIds)
          .gte("created_at", monthStr)
          .lt("created_at", nextMonthStr)
      : Promise.resolve({ data: [] as GoalContributionRow[], error: null }),
    supabase
      .from("ilp_products")
      .select("profile_id, name, monthly_premium, created_at")
      .in("profile_id", inIds)
      .eq("premium_payment_mode", "one_time"),
    buildTxnQuery("buy_sell"),
    supabase
      .from("bank_accounts")
      .select("profile_id, opening_balance, interest_rate_pct")
      .eq("family_id", familyId),
    buildTxnQuery("dividend"),
    buildSnapshotQuery(monthStr),
    buildSnapshotQuery(nextMonthStr),
    supabase
      .from("cpf_balances")
      .select("profile_id, month, oa_enc, sa_enc, ma_enc")
      .in("profile_id", inIds)
      .in("month", [prevMonthStr, monthStr]),
    buildIlpEntriesQuery(monthStr),
    buildIlpEntriesQuery(nextMonthStr),
  ])
}

async function fetchAllData(
  supabase: SupabaseClient,
  profileIds: string[],
  familyId: string,
  monthStr: string,
  year: number,
): Promise<FetchedData> {
  const monthDate = new Date(monthStr)
  const nextMonthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)
  const nextMonthStr = nextMonthDate.toISOString().slice(0, 10)
  const prevMonthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1)
  const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}-01`

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
  ] = await fetchPrimaryBatch(supabase, profileIds, familyId, monthStr, year)

  const allLoanIds = (loansRes.data ?? []).map((l) => (l as { id: string }).id)
  const allGoalIds = (savingsGoalsRes.data ?? []).map((g) => (g as { id: string }).id)
  const allIlpProductIds = [
    ...(ilpRes.data ?? []).map((p) => (p as { id?: string }).id).filter(Boolean),
    ...(sharedIlpRes.data ?? []).map((p) => (p as { id?: string }).id).filter(Boolean),
  ] as string[]

  const [
    earlyRepaymentsRes,
    goalContributionsRes,
    oneTimeIlpRes,
    investmentTxnsRes,
    bankAccountsForInterestRes,
    dividendTxnsRes,
    invSnapshotStartRes,
    invSnapshotEndRes,
    cpfBalancesRes,
    ilpEntriesStartRes,
    ilpEntriesEndRes,
  ] = await fetchSecondaryBatch(
    supabase,
    profileIds,
    familyId,
    monthStr,
    nextMonthStr,
    prevMonthStr,
    allLoanIds,
    allGoalIds,
    allIlpProductIds,
  )

  const inIds = profileIds.length > 0 ? profileIds : ["__none__"]
  const { data: taxEntriesData } = await supabase
    .from("tax_entries")
    .select("profile_id, year, actual_amount")
    .in("profile_id", inIds)
    .eq("year", year)

  const { data: accRows } = await supabase
    .from("investment_accounts")
    .select("id, account_name")
    .eq("family_id", familyId)

  return {
    cashflowRows: (cashflowRes.data ?? []) as Array<Record<string, unknown>>,
    profileRows: (profilesRes.data ?? []) as FetchedData["profileRows"],
    incomeRows: (incomeRes.data ?? []) as Array<Record<string, unknown>>,
    giroRules: (giroRulesRes.data ?? []) as FetchedData["giroRules"],
    insuranceRows: (insuranceRes.data ?? []) as Array<Record<string, unknown>>,
    ilpRows: (ilpRes.data ?? []) as Array<Record<string, unknown>>,
    loansRows: (loansRes.data ?? []) as Array<Record<string, unknown>>,
    taxReliefRows: (taxReliefRes.data ?? []) as TaxReliefRawRow[],
    sharedIlpRows: (sharedIlpRes.data ?? []) as FetchedData["sharedIlpRows"],
    savingsGoalRows: (savingsGoalsRes.data ?? []) as Array<Record<string, unknown>>,
    earlyRepaymentRows: (earlyRepaymentsRes.data ?? []) as EarlyRepaymentRow[],
    goalContributionRows: (goalContributionsRes.data ?? []) as GoalContributionRow[],
    oneTimeIlpRows: (oneTimeIlpRes.data ?? []) as OneTimeIlpRow[],
    investmentTxnRows: (investmentTxnsRes.data ?? []) as InvestmentTxnRow[],
    bankAccountsForInterest: (bankAccountsForInterestRes.data ?? []) as BankAccountInterestRow[],
    dividendTxnRows: (dividendTxnsRes.data ?? []) as DividendTxnRow[],
    invSnapshotStart: (invSnapshotStartRes.data ?? []) as InvSnapshotRow[],
    invSnapshotEnd: (invSnapshotEndRes.data ?? []) as InvSnapshotRow[],
    cpfBalanceRows: (cpfBalancesRes.data ?? []) as CpfBalanceRow[],
    ilpEntriesStart: (ilpEntriesStartRes.data ?? []) as IlpEntryRow[],
    ilpEntriesEnd: (ilpEntriesEndRes.data ?? []) as IlpEntryRow[],
    taxEntryRows: (taxEntriesData ?? []) as FetchedData["taxEntryRows"],
    investmentAccountRows: (accRows ?? []) as FetchedData["investmentAccountRows"],
  }
}

/* ------------------------------------------------------------------ */
/*  Lookup builders (split to keep cognitive complexity low)            */
/* ------------------------------------------------------------------ */

function buildCashflowAndProfileLookups(data: FetchedData) {
  const cashflowByKey = new Map<string, CashflowRow>()
  for (const row of data.cashflowRows) {
    const key = `${row.profile_id as string}:${normalizeMonthKey(row.month as string)}`
    const decoded = decodeMonthlyCashflowPii(row)
    cashflowByKey.set(key, { inflow: decoded.inflow, outflow: decoded.outflow })
  }

  const profileById = new Map<string, ProfileData>()
  for (const p of data.profileRows) {
    profileById.set(p.id, {
      birth_year: p.birth_year,
      name: p.name ?? undefined,
      self_help_group: p.self_help_group ?? undefined,
    })
  }

  const incomeByProfileId = new Map<string, IncomeData>()
  for (const ic of data.incomeRows) {
    const decoded = decodeIncomeConfigPii(ic)
    incomeByProfileId.set(ic.profile_id as string, {
      annual_salary: decoded.annual_salary ?? 0,
      bonus_estimate: decoded.bonus_estimate ?? null,
    })
  }

  const taxEntryByProfileYear = new Map<string, TaxEntryData>()
  for (const te of data.taxEntryRows) {
    taxEntryByProfileYear.set(`${te.profile_id}:${te.year}`, { actual_amount: te.actual_amount })
  }

  return { cashflowByKey, profileById, incomeByProfileId, taxEntryByProfileYear }
}

function buildPolicyLookups(data: FetchedData) {
  const nowDate = new Date().toISOString().slice(0, 10)
  const insuranceByProfile = new Map<string, Array<InsurancePolicy & { name: string }>>()
  for (const pol of data.insuranceRows) {
    const pid = pol.profile_id as string
    if (pol.end_date && (pol.end_date as string) < nowDate) continue
    const list = insuranceByProfile.get(pid) ?? []
    const decoded = decodeInsurancePoliciesPii(pol)
    list.push({
      name: (pol.name as string) ?? "Policy",
      premium_amount: decoded.premium_amount ?? 0,
      frequency: pol.frequency as string,
      is_active: pol.is_active as boolean | null,
      deduct_from_outflow: pol.deduct_from_outflow as boolean | null,
      type: pol.type as string,
      coverage_amount: decoded.coverage_amount,
    })
    insuranceByProfile.set(pid, list)
  }

  const ilpByProfile = new Map<string, IlpProductRow[]>()
  for (const row of data.ilpRows) {
    const pid = row.profile_id as string
    const list = ilpByProfile.get(pid) ?? []
    list.push({
      name: (row.name as string) ?? "ILP Product",
      monthly_premium: row.monthly_premium as number,
      premium_payment_mode: (row.premium_payment_mode as string | null) ?? null,
    })
    ilpByProfile.set(pid, list)
  }

  const loansByProfile = new Map<string, LoanRow[]>()
  for (const row of data.loansRows) {
    const pid = row.profile_id as string
    const list = loansByProfile.get(pid) ?? []
    list.push({
      name: (row.name as string) ?? "Loan",
      principal: decodeLoanPii(row).principal ?? 0,
      rate_pct: row.rate_pct as number,
      tenure_months: row.tenure_months as number,
      use_cpf_oa: !!row.use_cpf_oa,
      start_date: (row.start_date as string | null) ?? null,
    })
    loansByProfile.set(pid, list)
  }

  const taxReliefByProfileYear = new Map<string, Array<{ relief_type: string; amount: number }>>()
  for (const tr of data.taxReliefRows) {
    const key = `${tr.profile_id}:${tr.year}`
    const list = taxReliefByProfileYear.get(key) ?? []
    list.push({ relief_type: tr.relief_type, amount: decodeTaxReliefInputsPii(tr).amount ?? 0 })
    taxReliefByProfileYear.set(key, list)
  }

  return { insuranceByProfile, ilpByProfile, loansByProfile, taxReliefByProfileYear }
}

function buildIdNameMaps(data: FetchedData) {
  const savingsGoalsByProfile = new Map<string, number>()
  for (const g of data.savingsGoalRows) {
    const pid = g.profile_id as string
    const amt = (g.monthly_auto_amount as number | null) ?? 0
    savingsGoalsByProfile.set(pid, (savingsGoalsByProfile.get(pid) ?? 0) + amt)
  }

  const loanProfileMap = new Map<string, string>()
  const loanNameMap = new Map<string, string>()
  for (const loan of data.loansRows) {
    const lid = (loan as { id: string }).id
    loanProfileMap.set(lid, loan.profile_id as string)
    loanNameMap.set(lid, (loan.name as string) ?? "Loan")
  }

  const goalProfileMap = new Map<string, string>()
  const goalNameMap = new Map<string, string>()
  for (const g of data.savingsGoalRows) {
    const gid = (g as { id: string }).id
    goalProfileMap.set(gid, g.profile_id as string)
    goalNameMap.set(gid, (g.name as string) ?? "Goal")
  }

  const accountNameMap = new Map<string, string>()
  for (const a of data.investmentAccountRows) accountNameMap.set(a.id, a.account_name)

  return { savingsGoalsByProfile, loanProfileMap, loanNameMap, goalProfileMap, goalNameMap, accountNameMap }
}

function buildTransactionLookups(data: FetchedData, loanProfileMap: Map<string, string>, goalProfileMap: Map<string, string>) {
  const earlyRepaymentsByProfile = new Map<string, Array<{ amount: number; penalty_amount: number | null; date: string }>>()
  for (const er of data.earlyRepaymentRows) {
    const pid = loanProfileMap.get(er.loan_id)
    if (!pid) continue
    const list = earlyRepaymentsByProfile.get(pid) ?? []
    list.push({ amount: er.amount, penalty_amount: er.penalty_amount, date: er.date })
    earlyRepaymentsByProfile.set(pid, list)
  }

  const goalContribsByProfile = new Map<string, Array<{ amount: number; created_at: string }>>()
  for (const gc of data.goalContributionRows) {
    const pid = goalProfileMap.get(gc.goal_id)
    if (!pid) continue
    const list = goalContribsByProfile.get(pid) ?? []
    list.push({ amount: gc.amount, created_at: gc.created_at })
    goalContribsByProfile.set(pid, list)
  }

  const oneTimeIlpByProfile = new Map<string, Array<{ name: string; monthly_premium: number; created_at: string }>>()
  for (const ilpRow of data.oneTimeIlpRows) {
    const pid = ilpRow.profile_id as string
    const list = oneTimeIlpByProfile.get(pid) ?? []
    list.push({ name: ilpRow.name ?? "ILP Product", monthly_premium: ilpRow.monthly_premium, created_at: ilpRow.created_at })
    oneTimeIlpByProfile.set(pid, list)
  }

  const investmentTxnsByProfile = new Map<
    string,
    Array<{ symbol: string; type: string; quantity: number; price: number; commission?: number; account_id?: string | null; created_at: string }>
  >()
  for (const txn of data.investmentTxnRows) {
    const pid = txn.profile_id as string
    if (!pid) continue
    const list = investmentTxnsByProfile.get(pid) ?? []
    list.push({
      symbol: txn.symbol ?? "Unknown",
      type: txn.type,
      quantity: txn.quantity,
      price: txn.price,
      commission: txn.commission ?? 0,
      account_id: txn.account_id ?? null,
      created_at: txn.created_at,
    })
    investmentTxnsByProfile.set(pid, list)
  }

  return { earlyRepaymentsByProfile, goalContribsByProfile, oneTimeIlpByProfile, investmentTxnsByProfile }
}

async function buildLookups(
  supabase: SupabaseClient,
  data: FetchedData,
  profileIds: string[],
): Promise<Lookups> {
  const cf = buildCashflowAndProfileLookups(data)
  const pol = buildPolicyLookups(data)
  const ids = buildIdNameMaps(data)
  const txn = buildTransactionLookups(data, ids.loanProfileMap, ids.goalProfileMap)

  const giroAccountIds = [...new Set(data.giroRules.map((r) => r.source_bank_account_id))]
  let bankAccounts: Array<{ id: string; profile_id: string | null }> = []
  if (giroAccountIds.length > 0) {
    const { data: rows } = await supabase
      .from("bank_accounts")
      .select("id, profile_id")
      .in("id", giroAccountIds)
    bankAccounts = rows ?? []
  }
  const giroByProfile = buildGiroOutflowByProfile(data.giroRules, bankAccounts, profileIds)

  return {
    cashflowByKey: cf.cashflowByKey,
    profileById: cf.profileById,
    incomeByProfileId: cf.incomeByProfileId,
    taxEntryByProfileYear: cf.taxEntryByProfileYear,
    giroByProfile,
    insuranceByProfile: pol.insuranceByProfile,
    ilpByProfile: pol.ilpByProfile,
    loansByProfile: pol.loansByProfile,
    taxReliefByProfileYear: pol.taxReliefByProfileYear,
    savingsGoalsByProfile: ids.savingsGoalsByProfile,
    loanProfileMap: ids.loanProfileMap,
    loanNameMap: ids.loanNameMap,
    goalProfileMap: ids.goalProfileMap,
    goalNameMap: ids.goalNameMap,
    accountNameMap: ids.accountNameMap,
    earlyRepaymentsByProfile: txn.earlyRepaymentsByProfile,
    goalContribsByProfile: txn.goalContribsByProfile,
    oneTimeIlpByProfile: txn.oneTimeIlpByProfile,
    investmentTxnsByProfile: txn.investmentTxnsByProfile,
  }
}

/* ------------------------------------------------------------------ */
/*  Per-profile aggregation helpers                                     */
/* ------------------------------------------------------------------ */

function addProfileInflow(acc: Accumulator, pid: string, ctx: AggregationContext) {
  const { monthStr, year, lookups } = ctx
  const cf = lookups.cashflowByKey.get(`${pid}:${monthStr}`)
  if (cf) {
    const cfInflow = cf.inflow ?? 0
    acc.inflowTotal += cfInflow
    acc.inflowBreakdown.income = (acc.inflowBreakdown.income ?? 0) + cfInflow
    return
  }
  const profile = lookups.profileById.get(pid)
  const incomeConfig = lookups.incomeByProfileId.get(pid)
  if (!profile || !incomeConfig || incomeConfig.annual_salary <= 0) return

  const result = calculateTakeHome(
    incomeConfig.annual_salary,
    incomeConfig.bonus_estimate ?? 0,
    profile.birth_year,
    year,
    (profile.self_help_group as SelfHelpGroup) ?? "none",
  )
  const monthlyTotal = result.annualTakeHome / 12
  acc.inflowTotal += monthlyTotal

  const annualSalary = incomeConfig.annual_salary
  const bonus = incomeConfig.bonus_estimate ?? 0
  const totalAnnual = annualSalary + bonus
  const salaryPct = totalAnnual > 0 ? annualSalary / totalAnnual : 1
  const salary = Math.round(monthlyTotal * salaryPct * 100) / 100
  acc.inflowBreakdown.salary = (acc.inflowBreakdown.salary ?? 0) + salary
  if (bonus > 0) {
    const bonusMonthly = Math.round(monthlyTotal * (1 - salaryPct) * 100) / 100
    acc.inflowBreakdown.bonus = (acc.inflowBreakdown.bonus ?? 0) + bonusMonthly
  }
}

function addProfileDiscretionaryAndGiro(acc: Accumulator, pid: string, ctx: AggregationContext) {
  const cf = ctx.lookups.cashflowByKey.get(`${pid}:${ctx.monthStr}`)
  acc.discretionary += cf?.outflow ?? 0
  acc.giroTransfers += ctx.lookups.giroByProfile.get(pid) ?? 0
}

function addProfileInsuranceAndIlp(acc: Accumulator, pid: string, ctx: AggregationContext) {
  const pols = ctx.lookups.insuranceByProfile.get(pid) ?? []
  const insSplit = sumInsuranceOutflowPremiumsSplit(pols)
  acc.insurance += insSplit.insurance
  acc.ilp += insSplit.ilpFromLegacyPolicies
  for (const p of pols) {
    if (!p.is_active || !p.deduct_from_outflow) continue
    const monthlyEq = p.frequency === "monthly" ? p.premium_amount : p.premium_amount / 12
    if (monthlyEq <= 0) continue
    if (p.type === "ilp") acc.ilpSub.push({ label: p.name, amount: monthlyEq })
    else acc.insuranceSub.push({ label: p.name, amount: monthlyEq })
  }

  const profileIlps = ctx.lookups.ilpByProfile.get(pid) ?? []
  acc.ilp += sumIlpPremiums(profileIlps)
  for (const p of profileIlps) {
    if (p.premium_payment_mode === "one_time") continue
    if (p.monthly_premium > 0) acc.ilpSub.push({ label: p.name, amount: p.monthly_premium })
  }
}

function loanMonthlyPayment(loan: LoanRow): number {
  const monthlyRate = loan.rate_pct / 100 / 12
  if (monthlyRate > 0 && loan.tenure_months > 0) {
    return (loan.principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -loan.tenure_months))
  }
  if (loan.tenure_months > 0) return loan.principal / loan.tenure_months
  return 0
}

function addProfileLoans(acc: Accumulator, pid: string, ctx: AggregationContext) {
  const profileLoansData = ctx.lookups.loansByProfile.get(pid) ?? []
  acc.loans += sumLoanMonthlyPayments(profileLoansData, ctx.monthStr)
  for (const loan of profileLoansData) {
    if (loan.use_cpf_oa) continue
    if (loan.start_date && loan.start_date > ctx.monthStr) continue
    const payment = loanMonthlyPayment(loan)
    if (payment > 0) acc.loansSub.push({ label: loan.name, amount: payment })
  }
}

function addProfileSavingsGoals(acc: Accumulator, pid: string, ctx: AggregationContext) {
  acc.savingsGoals += ctx.lookups.savingsGoalsByProfile.get(pid) ?? 0
  for (const g of ctx.savingsGoalRows) {
    if (g.profile_id !== pid) continue
    const amt = g.monthly_auto_amount ?? 0
    if (amt > 0) acc.savingsGoalsSub.push({ label: g.name ?? "Goal", amount: amt })
  }

  const contribs = ctx.lookups.goalContribsByProfile.get(pid) ?? []
  acc.savingsGoals += sumGoalContributionsForMonth(contribs, ctx.monthStr)
  const monthPrefix = ctx.monthStr.slice(0, 7)
  for (const gc of contribs) {
    const gcMonth = gc.created_at.slice(0, 7)
    if (gcMonth !== monthPrefix || gc.amount <= 0) continue
    const gid = [...ctx.lookups.goalProfileMap.entries()].find(([, v]) => v === pid)?.[0]
    const gName = gid ? (ctx.lookups.goalNameMap.get(gid) ?? "Goal") : "Goal"
    acc.savingsGoalsSub.push({ label: `${gName} (extra)`, amount: gc.amount })
  }
}

function addProfileEarlyRepayments(acc: Accumulator, pid: string, ctx: AggregationContext) {
  const profileER = ctx.lookups.earlyRepaymentsByProfile.get(pid) ?? []
  acc.earlyRepayments += sumEarlyRepaymentsForMonth(profileER, ctx.monthStr)
  const monthPrefix = ctx.monthStr.slice(0, 7)
  for (const er of ctx.earlyRepaymentRows) {
    const erPid = ctx.lookups.loanProfileMap.get(er.loan_id)
    if (erPid !== pid) continue
    if (er.date.slice(0, 7) !== monthPrefix) continue
    const total = er.amount + (er.penalty_amount ?? 0)
    if (total > 0) {
      acc.earlyRepaymentsSub.push({ label: ctx.lookups.loanNameMap.get(er.loan_id) ?? "Loan", amount: total })
    }
  }
}

function addProfileOneTimeIlp(acc: Accumulator, pid: string, ctx: AggregationContext) {
  const oneTime = ctx.lookups.oneTimeIlpByProfile.get(pid) ?? []
  acc.ilpOneTime += sumOneTimeIlpForMonth(oneTime, ctx.monthStr)
  const monthPrefix = ctx.monthStr.slice(0, 7)
  for (const p of oneTime) {
    if (p.created_at.slice(0, 7) !== monthPrefix) continue
    if (p.monthly_premium > 0) acc.ilpOneTimeSub.push({ label: p.name, amount: p.monthly_premium })
  }
}

function addProfileTaxReliefCash(acc: Accumulator, pid: string, ctx: AggregationContext) {
  const profileRelief = ctx.taxReliefRows.filter((tr) => tr.profile_id === pid)
  acc.taxReliefCash += sumTaxReliefCashForMonth(
    profileRelief.map((tr) => ({
      relief_type: tr.relief_type,
      amount: decodeTaxReliefInputsPii(tr).amount ?? 0,
      year: tr.year,
    })),
    ctx.year,
  )
  for (const tr of profileRelief) {
    if (tr.year !== ctx.year) continue
    const label = CASH_RELIEF_LABELS[tr.relief_type]
    const amount = decodeTaxReliefInputsPii(tr).amount ?? 0
    if (label && amount > 0) acc.taxReliefCashSub.push({ label, amount: amount / 12 })
  }
}

function addProfileInvestments(acc: Accumulator, pid: string, ctx: AggregationContext) {
  const txns = ctx.lookups.investmentTxnsByProfile.get(pid) ?? []
  acc.investments += rawNetDeploymentForMonth(txns, ctx.monthStr)
  const monthPrefix = ctx.monthStr.slice(0, 7)
  for (const txn of txns) {
    if (txn.created_at.slice(0, 7) !== monthPrefix) continue
    const fee = txn.commission ?? 0
    const accKey = txn.account_id ?? "unknown"
    let symbolMap = acc.investmentsByAccountAndSymbol.get(accKey)
    if (!symbolMap) {
      symbolMap = new Map<string, number>()
      acc.investmentsByAccountAndSymbol.set(accKey, symbolMap)
    }
    const current = symbolMap.get(txn.symbol) ?? 0
    if (txn.type === "buy") symbolMap.set(txn.symbol, current + txn.quantity * txn.price + fee)
    else if (txn.type === "sell") symbolMap.set(txn.symbol, current - (txn.quantity * txn.price - fee))
  }
}

function addProfileTax(acc: Accumulator, pid: string, ctx: AggregationContext) {
  const pols = ctx.lookups.insuranceByProfile.get(pid) ?? []
  acc.tax += monthlyTaxForProfile(
    pid,
    ctx.year,
    ctx.lookups.profileById,
    ctx.lookups.incomeByProfileId,
    pols,
    ctx.lookups.taxReliefByProfileYear.get(`${pid}:${ctx.year}`) ?? [],
    ctx.lookups.taxEntryByProfileYear,
  )
}

function aggregateProfile(acc: Accumulator, pid: string, ctx: AggregationContext) {
  addProfileInflow(acc, pid, ctx)
  addProfileDiscretionaryAndGiro(acc, pid, ctx)
  addProfileInsuranceAndIlp(acc, pid, ctx)
  addProfileLoans(acc, pid, ctx)
  addProfileSavingsGoals(acc, pid, ctx)
  addProfileEarlyRepayments(acc, pid, ctx)
  addProfileOneTimeIlp(acc, pid, ctx)
  addProfileTaxReliefCash(acc, pid, ctx)
  addProfileInvestments(acc, pid, ctx)
  addProfileTax(acc, pid, ctx)
}

function addSharedIlp(acc: Accumulator, sharedIlpRows: IlpProductRow[]) {
  acc.ilp += sumIlpPremiums(sharedIlpRows)
  for (const p of sharedIlpRows) {
    if (p.premium_payment_mode === "one_time") continue
    if (p.monthly_premium > 0) acc.ilpSub.push({ label: p.name ?? "Shared ILP", amount: p.monthly_premium })
  }
}

function addBankInterest(acc: Accumulator, rows: BankAccountInterestRow[]): number {
  let bankInterest = 0
  for (const acct of rows) {
    const rate = acct.interest_rate_pct ?? 0
    const balance = acct.opening_balance ?? 0
    if (rate > 0 && balance > 0) bankInterest += (balance * rate) / 100 / 12
  }
  if (bankInterest > 0) {
    acc.inflowBreakdown.bankInterest = bankInterest
    acc.inflowTotal += bankInterest
  }
  return bankInterest
}

function addDividends(acc: Accumulator, rows: DividendTxnRow[]): number {
  let dividends = 0
  for (const txn of rows) dividends += txn.quantity * txn.price
  if (dividends > 0) {
    acc.inflowBreakdown.dividends = dividends
    acc.inflowTotal += dividends
  }
  return dividends
}

/* ------------------------------------------------------------------ */
/*  Section builders                                                    */
/* ------------------------------------------------------------------ */

const round = (n: number) => Math.round(n * 100) / 100

function sumLatestSnapshotPerProfile(rows: InvSnapshotRow[]): number {
  if (!rows.length) return 0
  const seen = new Set<string>()
  let total = 0
  for (const r of rows) {
    const key = r.profile_id ?? "__null__"
    if (seen.has(key)) continue
    seen.add(key)
    total += r.total_value ?? 0
  }
  return total
}

function sumLatestPerProduct(rows: IlpEntryRow[]): number {
  if (!rows.length) return 0
  const latest = new Map<string, number>()
  for (const r of rows) {
    if (!latest.has(r.product_id)) latest.set(r.product_id, r.fund_value)
  }
  let total = 0
  for (const v of latest.values()) total += v
  return total
}

function buildInvestmentDeploymentSubItems(
  acc: Accumulator,
  ctx: AggregationContext,
  filter: (net: number) => boolean,
  useAbs: boolean,
): SubItem[] {
  const sub: SubItem[] = []
  const hasMultipleAccounts = acc.investmentsByAccountAndSymbol.size > 1
  for (const [accId, symbolMap] of acc.investmentsByAccountAndSymbol) {
    const accName = ctx.lookups.accountNameMap.get(accId) ?? ""
    for (const [symbol, net] of symbolMap) {
      if (!filter(net)) continue
      const label = hasMultipleAccounts && accName ? `${accName}: ${symbol}` : symbol
      const amount = useAbs ? round(Math.abs(net)) : round(net)
      sub.push({ label, amount })
    }
  }
  sub.sort((a, b) => b.amount - a.amount)
  return sub
}

function buildInvestmentSection(
  acc: Accumulator,
  ctx: AggregationContext,
  dividends: number,
): InvestmentWaterfallSection | undefined {
  const invStartVal = sumLatestSnapshotPerProfile(ctx.invSnapshotStart)
  const invEndVal = sumLatestSnapshotPerProfile(ctx.invSnapshotEnd)

  let netDeployment = 0
  for (const pid of ctx.profileIds) {
    netDeployment += rawNetDeploymentForMonth(ctx.lookups.investmentTxnsByProfile.get(pid) ?? [], ctx.monthStr)
  }

  const hasAnything =
    invStartVal > 0 || invEndVal > 0 || netDeployment !== 0 || dividends > 0 || acc.ilp > 0 || acc.ilpOneTime > 0
  if (!hasAnything) return undefined

  const totalIlpPremiums = acc.ilp + acc.ilpOneTime
  const ilpStartTotal = sumLatestPerProduct(ctx.ilpEntriesStart)
  const ilpEndTotal = sumLatestPerProduct(ctx.ilpEntriesEnd)

  const invMarketGain = invEndVal - invStartVal - dividends - netDeployment - totalIlpPremiums
  const ilpPerformance = ilpEndTotal - ilpStartTotal - totalIlpPremiums
  const securitiesGainLoss = invMarketGain - ilpPerformance

  const investmentSub = buildInvestmentDeploymentSubItems(acc, ctx, (n) => n !== 0, true)
  const ilpCombined = [...acc.ilpSub, ...acc.ilpOneTimeSub]

  return {
    startingValue: round(invStartVal),
    endingValue: round(invEndVal),
    dividends: round(dividends),
    marketGain: round(invMarketGain),
    netDeployment: round(netDeployment),
    ilpPremiums: round(totalIlpPremiums),
    securitiesGainLoss: round(securitiesGainLoss),
    ilpPerformance: round(ilpPerformance),
    deploymentSubItems: investmentSub.length > 0 ? investmentSub : undefined,
    ilpSubItems: ilpCombined.length > 0 ? ilpCombined : undefined,
  }
}

function aggregateCpfBalances(rows: CpfBalanceRow[], prevMonthStr: string, monthStr: string) {
  let startOa = 0, startSa = 0, startMa = 0
  let endOa = 0, endSa = 0, endMa = 0
  let hasEnd = false
  for (const row of rows) {
    const m = typeof row.month === "string" ? row.month.slice(0, 10) : ""
    const decoded = decodeCpfBalancesPii(row)
    const oa = Number(decoded.oa) || 0
    const sa = Number(decoded.sa) || 0
    const ma = Number(decoded.ma) || 0
    if (m === prevMonthStr) {
      startOa += oa; startSa += sa; startMa += ma
    } else if (m === monthStr) {
      endOa += oa; endSa += sa; endMa += ma
      hasEnd = true
    }
  }
  return { start: startOa + startSa + startMa, end: endOa + endSa + endMa, hasEnd }
}

function computeCpfContributions(ctx: AggregationContext): number {
  let total = 0
  for (const pid of ctx.profileIds) {
    const profile = ctx.lookups.profileById.get(pid)
    const incomeConfig = ctx.lookups.incomeByProfileId.get(pid)
    if (!profile || !incomeConfig || incomeConfig.annual_salary <= 0) continue
    const age = getAge(profile.birth_year, ctx.year)
    const monthlyGross = incomeConfig.annual_salary / 12
    total += calculateCpfContribution(monthlyGross, age, ctx.year).total
  }
  return total
}

function computeCpfHousing(ctx: AggregationContext): number {
  let total = 0
  for (const pid of ctx.profileIds) {
    const profileLoans = ctx.lookups.loansByProfile.get(pid) ?? []
    for (const loan of profileLoans) {
      if (!loan.use_cpf_oa) continue
      if (loan.start_date && loan.start_date > ctx.monthStr) continue
      total += loanMonthlyPayment(loan)
    }
  }
  return total
}

function buildCpfSection(ctx: AggregationContext): CpfWaterfallSection | undefined {
  const cpfRows = ctx.cpfBalanceRows
  if (cpfRows.length === 0 && ctx.profileIds.length === 0) return undefined

  const balances = aggregateCpfBalances(cpfRows, ctx.prevMonthStr, ctx.monthStr)
  const contributions = computeCpfContributions(ctx)
  const housing = computeCpfHousing(ctx)
  const cpfEnd = balances.hasEnd ? balances.end : balances.start + contributions - housing

  if (balances.start <= 0 && cpfEnd <= 0 && contributions <= 0) return undefined
  return {
    startingBalance: round(balances.start),
    endingBalance: round(cpfEnd),
    contributions: round(contributions),
    housing: round(housing),
  }
}

function buildSubBreakdowns(acc: Accumulator, ctx: AggregationContext) {
  const out: Record<string, SubItem[]> = {}
  const roundSub = (items: SubItem[]) =>
    items.filter((i) => i.amount > 0).map((i) => ({ label: i.label, amount: round(i.amount) }))

  if (acc.insuranceSub.length >= 2) out["Insurance"] = roundSub(acc.insuranceSub)
  if (acc.ilpSub.length >= 2) out["ILP"] = roundSub(acc.ilpSub)
  if (acc.ilpOneTimeSub.length >= 2) out["ILP (One-Time)"] = roundSub(acc.ilpOneTimeSub)
  if (acc.loansSub.length >= 2) out["Loans"] = roundSub(acc.loansSub)
  if (acc.earlyRepaymentsSub.length >= 2) out["Early Repayments"] = roundSub(acc.earlyRepaymentsSub)
  if (acc.savingsGoalsSub.length >= 2) out["Savings Goals"] = roundSub(acc.savingsGoalsSub)
  if (acc.taxReliefCashSub.length >= 2) out["SRS/CPF Top-ups"] = roundSub(acc.taxReliefCashSub)

  const bankInvestmentSub = buildInvestmentDeploymentSubItems(acc, ctx, (n) => n > 0, false)
  if (bankInvestmentSub.length >= 2) out["Investments"] = bankInvestmentSub

  return out
}

/* ------------------------------------------------------------------ */
/*  Main entry                                                          */
/* ------------------------------------------------------------------ */

export async function fetchSingleMonthCashflow(
  supabase: SupabaseClient,
  params: { profileIds: string[]; familyId: string; month: string },
): Promise<SingleMonthResult> {
  const { profileIds, familyId, month } = params
  const monthStr = normalizeMonthKey(month)
  const year = Number.parseInt(monthStr.slice(0, 4), 10) || new Date().getFullYear()
  const monthDate = new Date(monthStr)
  const prevMonthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1)
  const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}-01`

  const data = await fetchAllData(supabase, profileIds, familyId, monthStr, year)
  const lookups = await buildLookups(supabase, data, profileIds)

  const sharedIlpRows: IlpProductRow[] = data.sharedIlpRows.map((p) => ({
    name: p.name ?? "Shared ILP",
    monthly_premium: p.monthly_premium,
    premium_payment_mode: p.premium_payment_mode,
  }))

  const ctx: AggregationContext = {
    monthStr,
    prevMonthStr,
    year,
    profileIds,
    lookups,
    taxReliefRows: data.taxReliefRows,
    earlyRepaymentRows: data.earlyRepaymentRows,
    savingsGoalRows: data.savingsGoalRows.map((g) => ({
      profile_id: (g.profile_id as string | null) ?? null,
      name: (g.name as string | null) ?? null,
      monthly_auto_amount: (g.monthly_auto_amount as number | null) ?? null,
    })),
    ilpEntriesStart: data.ilpEntriesStart,
    ilpEntriesEnd: data.ilpEntriesEnd,
    invSnapshotStart: data.invSnapshotStart,
    invSnapshotEnd: data.invSnapshotEnd,
    cpfBalanceRows: data.cpfBalanceRows,
    sharedIlpRows,
  }

  const acc = makeAccumulator()
  addBankInterest(acc, data.bankAccountsForInterest)
  const dividends = addDividends(acc, data.dividendTxnRows)

  for (const pid of profileIds) aggregateProfile(acc, pid, ctx)
  addSharedIlp(acc, sharedIlpRows)

  const outflowTotal =
    acc.discretionary +
    acc.giroTransfers +
    acc.insurance +
    acc.ilp +
    acc.ilpOneTime +
    acc.loans +
    acc.earlyRepayments +
    acc.tax +
    acc.taxReliefCash +
    acc.savingsGoals +
    acc.investments
  const netSavings = acc.inflowTotal - outflowTotal

  const singleProfileId = profileIds.length === 1 ? (profileIds[0] ?? null) : null
  const endingBankBalance = await computeBankTotal(supabase, familyId, singleProfileId, monthStr)
  const startingBankBalance = endingBankBalance - netSavings

  const investmentSection = buildInvestmentSection(acc, ctx, dividends)
  const cpfSection = buildCpfSection(ctx)
  const subBreakdowns = buildSubBreakdowns(acc, ctx)

  const roundedInflowBreakdown =
    Object.keys(acc.inflowBreakdown).length > 0
      ? Object.fromEntries(
          Object.entries(acc.inflowBreakdown).map(([k, v]) => [k, round(v ?? 0)]),
        )
      : undefined

  return {
    month,
    startingBankBalance: round(startingBankBalance),
    endingBankBalance: round(endingBankBalance),
    inflowTotal: round(acc.inflowTotal),
    inflowBreakdown: roundedInflowBreakdown,
    outflowTotal: round(outflowTotal),
    outflowBreakdown: {
      discretionary: round(acc.discretionary),
      insurance: round(acc.insurance),
      ilp: round(acc.ilp),
      ilpOneTime: round(acc.ilpOneTime),
      loans: round(acc.loans),
      earlyRepayments: round(acc.earlyRepayments),
      tax: round(acc.tax),
      taxReliefCash: round(acc.taxReliefCash),
      savingsGoals: round(acc.savingsGoals),
      investments: round(acc.investments),
      giroTransfers: round(acc.giroTransfers),
    },
    netSavings: round(netSavings),
    investments: investmentSection,
    cpf: cpfSection,
    ...(Object.keys(subBreakdowns).length > 0 ? { subBreakdowns } : {}),
  }
}
