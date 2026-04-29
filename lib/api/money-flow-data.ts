/**
 * Batch data loader for the /api/developer/money-flow route.
 *
 * Computes real dollar amounts for all 23 graph nodes and flow formulas
 * for all edges, reusing existing calculation functions.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  MoneyFlowPayload,
  MoneyFlowNodeData,
  MoneyFlowEdgeData,
} from "@/lib/developer/money-flow-types"
import { GRAPH_LINKS } from "@/lib/developer/calculation-graph-data"
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
  GIRO_OUTFLOW_DESTINATIONS,
  type CashflowRow,
  type IncomeData,
  type InsurancePolicy,
  type ProfileData,
  type TaxEntryData,
} from "@/lib/api/cashflow-aggregation"
import { decodeCpfBalancesPii } from "@/lib/repos/cpf-balances"
import { decodeCpfHealthcareConfigPii } from "@/lib/repos/cpf-healthcare-config"
import { decodeIncomeConfigPii } from "@/lib/repos/income-config"
import { decodeInsurancePoliciesPii } from "@/lib/repos/insurance-policies"
import { decodeLoanPii } from "@/lib/repos/loans"
import { decodeMonthlyCashflowPii } from "@/lib/repos/monthly-cashflow"
import { decodeTaxGiroSchedulePii } from "@/lib/repos/tax-giro-schedule"
import { decodeTaxReliefInputsPii } from "@/lib/repos/tax-relief-inputs"
import { getAge, calculateCpfContribution } from "@/lib/calculations/cpf"
import {
  calculateSelfHelpContribution,
  type SelfHelpGroup,
} from "@/lib/calculations/self-help-group"
import {
  estimateOutstandingPrincipal,
  loanMonthlyPayment,
} from "@/lib/calculations/loans"
import { computeTotalInvestmentsValue } from "@/lib/api/net-liquid"
import {
  calculateTax,
  type ProfileForTax,
  type InsurancePolicyForTax,
  type ManualReliefInput,
  type DependentForTax,
  type SpouseForTax,
} from "@/lib/calculations/tax"
import {
  getAnnualHealthcareMaDeduction,
  type CpfHealthcareConfig,
} from "@/lib/calculations/cpf-healthcare"
import { calculateGiroSchedule, getNextGiroPaymentIndex } from "@/lib/calculations/tax-giro"

export type MoneyFlowParams = {
  profileIds: string[]
  familyId: string
  profileId: string | null
}

function fmt(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`
  }
  if (abs >= 10_000) {
    return `$${Math.round(value).toLocaleString()}`
  }
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
}

type ExtendedProfileData = ProfileData & {
  name: string
  gender?: string | null
  spouse_profile_id?: string | null
  marital_status?: string | null
}

type LoanLookupRow = {
  id: string
  principal: number
  rate_pct: number
  tenure_months: number
  start_date: string
  use_cpf_oa: boolean
}

type Lookups = {
  cashflowByKey: Map<string, CashflowRow>
  profileById: Map<string, ExtendedProfileData>
  incomeByProfileId: Map<string, IncomeData>
  giroByProfile: Map<string, number>
  insuranceByProfile: Map<string, InsurancePolicy[]>
  ilpByProfile: Map<string, Array<{ monthly_premium: number; premium_payment_mode?: string | null }>>
  loansByProfile: Map<string, LoanLookupRow[]>
  taxReliefByProfileYear: Map<string, Array<{ relief_type: string; amount: number }>>
  savingsGoalsByProfile: Map<string, number>
  savingsTargetByProfile: Map<string, number>
  savingsCurrentByProfile: Map<string, number>
  healthcareByProfile: Map<string, CpfHealthcareConfig | null>
  familyDependents: DependentForTax[]
}

type SecondaryLookups = {
  loanProfileMap: Map<string, string>
  earlyRepsByProfile: Map<string, Array<{ amount: number; penalty_amount: number | null; date: string }>>
  goalProfileMap: Map<string, string>
  goalContribsByProfile: Map<string, Array<{ amount: number; created_at: string }>>
  oneTimeIlpByProfile: Map<string, Array<{ monthly_premium: number; created_at: string }>>
  investTxnsByProfile: Map<string, Array<{ type: string; quantity: number; price: number; created_at: string }>>
  taxEntryByProfileYear: Map<string, TaxEntryData>
}

type Accumulator = {
  totalGrossMonthly: number
  totalBonus: number
  totalAnnualSalary: number
  totalEmployeeCpf: number
  totalEmployerCpf: number
  totalCpfOa: number
  totalCpfSa: number
  totalCpfMa: number
  totalSelfHelp: number
  totalTakeHome: number
  totalInsurancePremium: number
  totalIlpPremium: number
  totalLoanMonthly: number
  totalLoanPrincipal: number
  totalSavingsGoalMonthly: number
  totalSavingsTarget: number
  totalSavingsCurrent: number
  totalTaxPayable: number
  totalTaxReliefs: number
  totalTaxEmploymentIncome: number
  totalCpfBalanceOa: number
  totalCpfBalanceSa: number
  totalCpfBalanceMa: number
  totalHealthcareMsl: number
  totalHealthcareCsl: number
  totalHealthcarePmi: number
  totalHealthcareAnnual: number
  totalDependentReliefs: number
  dependentChildCount: number
  dependentParentCount: number
  totalEffectiveInflow: number
  totalEffectiveOutflow: number
  totalIlpOneTime: number
  totalTaxReliefCashOutflow: number
  totalInvestmentPurchases: number
  totalGoalContributions: number
  totalDividends: number
  totalBankInterest: number
}

function makeAccumulator(): Accumulator {
  return {
    totalGrossMonthly: 0,
    totalBonus: 0,
    totalAnnualSalary: 0,
    totalEmployeeCpf: 0,
    totalEmployerCpf: 0,
    totalCpfOa: 0,
    totalCpfSa: 0,
    totalCpfMa: 0,
    totalSelfHelp: 0,
    totalTakeHome: 0,
    totalInsurancePremium: 0,
    totalIlpPremium: 0,
    totalLoanMonthly: 0,
    totalLoanPrincipal: 0,
    totalSavingsGoalMonthly: 0,
    totalSavingsTarget: 0,
    totalSavingsCurrent: 0,
    totalTaxPayable: 0,
    totalTaxReliefs: 0,
    totalTaxEmploymentIncome: 0,
    totalCpfBalanceOa: 0,
    totalCpfBalanceSa: 0,
    totalCpfBalanceMa: 0,
    totalHealthcareMsl: 0,
    totalHealthcareCsl: 0,
    totalHealthcarePmi: 0,
    totalHealthcareAnnual: 0,
    totalDependentReliefs: 0,
    dependentChildCount: 0,
    dependentParentCount: 0,
    totalEffectiveInflow: 0,
    totalEffectiveOutflow: 0,
    totalIlpOneTime: 0,
    totalTaxReliefCashOutflow: 0,
    totalInvestmentPurchases: 0,
    totalGoalContributions: 0,
    totalDividends: 0,
    totalBankInterest: 0,
  }
}

/* ------------------------------------------------------------------ */
/*  Primary data fetch                                                  */
/* ------------------------------------------------------------------ */

async function fetchPrimaryQueries(
  supabase: SupabaseClient,
  profileIds: string[],
  targetProfileIds: string[],
  familyId: string,
  profileId: string | null,
  currentYear: number,
  rangeStart: string,
) {
  const inIds = profileIds.length > 0 ? profileIds : ["__none__"]
  const targetIds = targetProfileIds.length > 0 ? targetProfileIds : ["__none__"]
  return Promise.all([
    supabase
      .from("monthly_cashflow")
      .select("profile_id, month, inflow_enc, outflow_enc")
      .in("profile_id", inIds)
      .gte("month", rangeStart)
      .order("month", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, birth_year, name, primary_bank_account_id, gender, spouse_profile_id, marital_status, self_help_group")
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
        "profile_id, premium_amount_enc, frequency, is_active, deduct_from_outflow, type, coverage_amount_enc, end_date",
      )
      .in("profile_id", inIds),
    supabase
      .from("ilp_products")
      .select("profile_id, monthly_premium, premium_payment_mode")
      .in("profile_id", inIds),
    supabase
      .from("loans")
      .select("id, profile_id, principal, principal_enc, rate_pct, tenure_months, start_date, use_cpf_oa")
      .in("profile_id", inIds),
    supabase
      .from("tax_relief_inputs")
      .select("profile_id, year, relief_type, amount_enc")
      .in("profile_id", inIds)
      .in("year", [currentYear, currentYear - 1]),
    supabase
      .from("ilp_products")
      .select("monthly_premium, premium_payment_mode")
      .eq("family_id", familyId)
      .is("profile_id", null),
    supabase
      .from("savings_goals")
      .select("id, profile_id, monthly_auto_amount, target_amount, current_amount")
      .in("profile_id", inIds),
    supabase
      .from("cpf_balances")
      .select("profile_id, month, oa_enc, sa_enc, ma_enc")
      .in("profile_id", targetIds)
      .order("month", { ascending: false }),
    supabase
      .from("bank_accounts")
      .select("id, profile_id, opening_balance, locked_amount, family_id")
      .eq("family_id", familyId),
    computeTotalInvestmentsValue(supabase, familyId, profileId, null),
    supabase
      .from("dependents")
      .select("id, name, birth_year, relationship, claimed_by_profile_id, annual_income, in_full_time_education, living_with_claimant, is_handicapped")
      .eq("family_id", familyId),
    supabase
      .from("cpf_healthcare_config")
      .select(
        "profile_id, msl_annual_override_enc, csl_annual_enc, csl_supplement_annual_enc, isp_annual_enc",
      )
      .in("profile_id", inIds),
    supabase
      .from("tax_giro_schedule")
      .select(
        "profile_id, year, schedule_enc, total_payable_enc, outstanding_balance_enc, source",
      )
      .in("profile_id", targetIds)
      .eq("year", currentYear),
  ])
}

async function fetchSecondaryQueries(
  supabase: SupabaseClient,
  targetProfileIds: string[],
  familyId: string,
  monthStr: string,
  nextMonthStr: string,
  loanIds: string[],
  goalIds: string[],
  year: number,
) {
  const targetIds = targetProfileIds.length > 0 ? targetProfileIds : ["__none__"]
  return Promise.all([
    loanIds.length > 0
      ? supabase
          .from("loan_early_repayments")
          .select("loan_id, amount, penalty_amount, date")
          .in("loan_id", loanIds)
          .gte("date", monthStr)
          .lt("date", nextMonthStr)
      : Promise.resolve({ data: [] as Array<{ loan_id: string; amount: number; penalty_amount: number | null; date: string }>, error: null }),
    goalIds.length > 0
      ? supabase
          .from("goal_contributions")
          .select("goal_id, amount, created_at")
          .in("goal_id", goalIds)
          .gte("created_at", monthStr)
          .lt("created_at", nextMonthStr)
      : Promise.resolve({ data: [] as Array<{ goal_id: string; amount: number; created_at: string }>, error: null }),
    supabase
      .from("ilp_products")
      .select("profile_id, monthly_premium, created_at")
      .in("profile_id", targetIds)
      .eq("premium_payment_mode", "one_time"),
    supabase
      .from("investment_transactions")
      .select("profile_id, type, quantity, price, created_at")
      .eq("family_id", familyId)
      .in("type", ["buy", "sell"])
      .gte("created_at", monthStr)
      .lt("created_at", nextMonthStr),
    supabase
      .from("bank_accounts")
      .select("opening_balance, interest_rate_pct, profile_id")
      .eq("family_id", familyId),
    supabase
      .from("investment_transactions")
      .select("profile_id, quantity, price, created_at")
      .eq("family_id", familyId)
      .eq("type", "dividend")
      .gte("created_at", monthStr)
      .lt("created_at", nextMonthStr),
    supabase
      .from("tax_entries")
      .select("profile_id, year, actual_amount")
      .in("profile_id", targetIds)
      .eq("year", year),
  ])
}

/* ------------------------------------------------------------------ */
/*  Primary lookup builders                                             */
/* ------------------------------------------------------------------ */

function buildBaseLookups(
  cashflowRows: Array<Record<string, unknown>>,
  profileRows: Array<{
    id: string
    birth_year: number
    name: string
    gender: string | null
    spouse_profile_id: string | null
    marital_status: string | null
    self_help_group: string | null
  }>,
  incomeRows: Array<Record<string, unknown>>,
) {
  const cashflowByKey = new Map<string, CashflowRow>()
  for (const row of cashflowRows) {
    const m = normalizeMonthKey(row.month as string)
    const key = `${row.profile_id as string}:${m}`
    if (cashflowByKey.has(key)) continue
    const decoded = decodeMonthlyCashflowPii(row)
    cashflowByKey.set(key, { inflow: decoded.inflow, outflow: decoded.outflow })
  }

  const profileById = new Map<string, ExtendedProfileData>()
  for (const p of profileRows) {
    profileById.set(p.id, {
      birth_year: p.birth_year,
      name: p.name,
      gender: p.gender,
      spouse_profile_id: p.spouse_profile_id,
      marital_status: p.marital_status,
      self_help_group: p.self_help_group ?? undefined,
    })
  }

  const incomeByProfileId = new Map<string, IncomeData>()
  for (const ic of incomeRows) {
    const decoded = decodeIncomeConfigPii(ic)
    incomeByProfileId.set(ic.profile_id as string, {
      annual_salary: decoded.annual_salary ?? 0,
      bonus_estimate: decoded.bonus_estimate ?? null,
    })
  }

  return { cashflowByKey, profileById, incomeByProfileId }
}

function buildPolicyLookups(
  insuranceRows: Array<Record<string, unknown>>,
  ilpRows: Array<Record<string, unknown>>,
  loansRows: Array<Record<string, unknown>>,
  taxReliefRows: Array<{ profile_id: string; year: number; relief_type: string; amount_enc?: string | null }>,
) {
  const nowDate = new Date().toISOString().slice(0, 10)
  const insuranceByProfile = new Map<string, InsurancePolicy[]>()
  for (const pol of insuranceRows) {
    const pid = pol.profile_id as string
    if (pol.end_date && (pol.end_date as string) < nowDate) continue
    const list = insuranceByProfile.get(pid) ?? []
    const decoded = decodeInsurancePoliciesPii(pol)
    list.push({
      premium_amount: decoded.premium_amount ?? 0,
      frequency: pol.frequency as string,
      is_active: pol.is_active as boolean | null,
      deduct_from_outflow: pol.deduct_from_outflow as boolean | null,
      type: pol.type as string,
      coverage_amount: decoded.coverage_amount,
    })
    insuranceByProfile.set(pid, list)
  }

  const ilpByProfile = new Map<string, Array<{ monthly_premium: number; premium_payment_mode?: string | null }>>()
  for (const row of ilpRows) {
    const pid = row.profile_id as string
    const list = ilpByProfile.get(pid) ?? []
    list.push({
      monthly_premium: row.monthly_premium as number,
      premium_payment_mode: (row.premium_payment_mode as string | null) ?? null,
    })
    ilpByProfile.set(pid, list)
  }

  const loansByProfile = new Map<string, LoanLookupRow[]>()
  for (const row of loansRows) {
    const pid = row.profile_id as string
    const list = loansByProfile.get(pid) ?? []
    list.push({
      id: row.id as string,
      principal: decodeLoanPii(row).principal ?? 0,
      rate_pct: row.rate_pct as number,
      tenure_months: row.tenure_months as number,
      start_date: row.start_date as string,
      use_cpf_oa: !!row.use_cpf_oa,
    })
    loansByProfile.set(pid, list)
  }

  const taxReliefByProfileYear = new Map<string, Array<{ relief_type: string; amount: number }>>()
  for (const tr of taxReliefRows) {
    const key = `${tr.profile_id}:${tr.year}`
    const list = taxReliefByProfileYear.get(key) ?? []
    list.push({ relief_type: tr.relief_type, amount: decodeTaxReliefInputsPii(tr).amount ?? 0 })
    taxReliefByProfileYear.set(key, list)
  }

  return { insuranceByProfile, ilpByProfile, loansByProfile, taxReliefByProfileYear }
}

function buildSavingsAndDependentLookups(
  savingsGoalRows: Array<Record<string, unknown>>,
  dependentRows: Array<{
    name: string
    birth_year: number
    relationship: string
    annual_income: number | null
    in_full_time_education: boolean | null
    living_with_claimant: boolean | null
    is_handicapped: boolean | null
    claimed_by_profile_id: string | null
  }>,
  healthcareRows: Array<Record<string, unknown>>,
) {
  const savingsGoalsByProfile = new Map<string, number>()
  const savingsTargetByProfile = new Map<string, number>()
  const savingsCurrentByProfile = new Map<string, number>()
  for (const g of savingsGoalRows) {
    const pid = g.profile_id as string
    savingsGoalsByProfile.set(pid, (savingsGoalsByProfile.get(pid) ?? 0) + ((g.monthly_auto_amount as number | null) ?? 0))
    savingsTargetByProfile.set(pid, (savingsTargetByProfile.get(pid) ?? 0) + ((g.target_amount as number | null) ?? 0))
    savingsCurrentByProfile.set(pid, (savingsCurrentByProfile.get(pid) ?? 0) + ((g.current_amount as number | null) ?? 0))
  }

  const familyDependents: DependentForTax[] = dependentRows.map((d) => ({
    name: d.name,
    birth_year: d.birth_year,
    relationship: d.relationship as "child" | "parent" | "grandparent",
    annual_income: Number(d.annual_income ?? 0),
    in_full_time_education: !!d.in_full_time_education,
    living_with_claimant: !!d.living_with_claimant,
    is_handicapped: !!d.is_handicapped,
    claimed_by_profile_id: d.claimed_by_profile_id,
  }))

  const healthcareByProfile = new Map<string, CpfHealthcareConfig | null>()
  for (const hc of healthcareRows) {
    const decoded = decodeCpfHealthcareConfigPii(hc)
    healthcareByProfile.set(hc.profile_id as string, {
      profileId: hc.profile_id as string,
      mslAnnualOverride: decoded.msl_annual_override,
      cslAnnual: decoded.csl_annual ?? 0,
      cslSupplementAnnual: decoded.csl_supplement_annual ?? 0,
      ispAnnual: decoded.isp_annual ?? 0,
    })
  }

  return { savingsGoalsByProfile, savingsTargetByProfile, savingsCurrentByProfile, familyDependents, healthcareByProfile }
}

/* ------------------------------------------------------------------ */
/*  Secondary lookup builders                                           */
/* ------------------------------------------------------------------ */

function buildSecondaryLookups(
  loansRows: Array<{ id: string; profile_id: string }>,
  savingsGoalRows: Array<{ id: string; profile_id: string }>,
  earlyRepRows: Array<{ loan_id: string; amount: number; penalty_amount: number | null; date: string }>,
  goalContribRows: Array<{ goal_id: string; amount: number; created_at: string }>,
  oneTimeIlpRows: Array<{ profile_id: string; monthly_premium: number; created_at: string }>,
  investTxnRows: Array<{ profile_id: string; type: string; quantity: number; price: number; created_at: string }>,
  taxEntryRows: Array<{ profile_id: string; year: number; actual_amount: number | null }>,
): SecondaryLookups {
  const loanProfileMap = new Map<string, string>()
  for (const loan of loansRows) loanProfileMap.set(loan.id, loan.profile_id)

  const earlyRepsByProfile = new Map<string, Array<{ amount: number; penalty_amount: number | null; date: string }>>()
  for (const er of earlyRepRows) {
    const pid = loanProfileMap.get(er.loan_id)
    if (!pid) continue
    const list = earlyRepsByProfile.get(pid) ?? []
    list.push(er)
    earlyRepsByProfile.set(pid, list)
  }

  const goalProfileMap = new Map<string, string>()
  for (const g of savingsGoalRows) goalProfileMap.set(g.id, g.profile_id)

  const goalContribsByProfile = new Map<string, Array<{ amount: number; created_at: string }>>()
  for (const gc of goalContribRows) {
    const pid = goalProfileMap.get(gc.goal_id)
    if (!pid) continue
    const list = goalContribsByProfile.get(pid) ?? []
    list.push(gc)
    goalContribsByProfile.set(pid, list)
  }

  const oneTimeIlpByProfile = new Map<string, Array<{ monthly_premium: number; created_at: string }>>()
  for (const ilpRow of oneTimeIlpRows) {
    const list = oneTimeIlpByProfile.get(ilpRow.profile_id) ?? []
    list.push(ilpRow)
    oneTimeIlpByProfile.set(ilpRow.profile_id, list)
  }

  const investTxnsByProfile = new Map<string, Array<{ type: string; quantity: number; price: number; created_at: string }>>()
  for (const txn of investTxnRows) {
    if (!txn.profile_id) continue
    const list = investTxnsByProfile.get(txn.profile_id) ?? []
    list.push(txn)
    investTxnsByProfile.set(txn.profile_id, list)
  }

  const taxEntryByProfileYear = new Map<string, TaxEntryData>()
  for (const te of taxEntryRows) {
    taxEntryByProfileYear.set(`${te.profile_id}:${te.year}`, { actual_amount: te.actual_amount })
  }

  return {
    loanProfileMap,
    earlyRepsByProfile,
    goalProfileMap,
    goalContribsByProfile,
    oneTimeIlpByProfile,
    investTxnsByProfile,
    taxEntryByProfileYear,
  }
}

/* ------------------------------------------------------------------ */
/*  Per-profile aggregation                                             */
/* ------------------------------------------------------------------ */

type BaseAggCtx = {
  lookups: Lookups
  currentYear: number
  now: Date
  cpfRows: Array<Record<string, unknown>>
}

function aggregateProfileIncome(acc: Accumulator, pid: string, ctx: BaseAggCtx) {
  const profile = ctx.lookups.profileById.get(pid)
  const income = ctx.lookups.incomeByProfileId.get(pid)
  if (!profile || !income) return null

  const monthlyGross = income.annual_salary / 12
  const age = getAge(profile.birth_year, ctx.currentYear)
  const cpf = calculateCpfContribution(monthlyGross, age, ctx.currentYear)

  acc.totalGrossMonthly += monthlyGross
  acc.totalBonus += income.bonus_estimate ?? 0
  acc.totalAnnualSalary += income.annual_salary

  const shg = calculateSelfHelpContribution(monthlyGross, (profile.self_help_group as SelfHelpGroup) ?? "none")

  acc.totalEmployeeCpf += cpf.employee
  acc.totalEmployerCpf += cpf.employer
  acc.totalCpfOa += cpf.oa
  acc.totalCpfSa += cpf.sa
  acc.totalCpfMa += cpf.ma
  acc.totalSelfHelp += shg.monthlyAmount
  acc.totalTakeHome += monthlyGross - cpf.employee - shg.monthlyAmount

  return { profile, income, age, cpf }
}

function aggregateProfileLoans(acc: Accumulator, pid: string, lookups: Lookups) {
  const profileLoans = lookups.loansByProfile.get(pid) ?? []
  for (const loan of profileLoans) {
    if (!loan.use_cpf_oa) {
      acc.totalLoanMonthly += loanMonthlyPayment(loan.principal, loan.rate_pct, loan.tenure_months)
    }
    acc.totalLoanPrincipal += loan.principal
  }
}

function aggregateProfileSavings(acc: Accumulator, pid: string, lookups: Lookups) {
  acc.totalSavingsGoalMonthly += lookups.savingsGoalsByProfile.get(pid) ?? 0
  acc.totalSavingsTarget += lookups.savingsTargetByProfile.get(pid) ?? 0
  acc.totalSavingsCurrent += lookups.savingsCurrentByProfile.get(pid) ?? 0
}

function aggregateProfileTax(
  acc: Accumulator,
  pid: string,
  profile: ExtendedProfileData,
  income: IncomeData,
  lookups: Lookups,
  currentYear: number,
) {
  const pols = lookups.insuranceByProfile.get(pid) ?? []
  const manualReliefs: ManualReliefInput[] = (lookups.taxReliefByProfileYear.get(`${pid}:${currentYear}`) ?? []).map((r) => ({
    relief_type: r.relief_type,
    amount: r.amount,
  }))
  const polsForTax: InsurancePolicyForTax[] = pols.map((p) => ({
    type: p.type,
    premium_amount: p.premium_amount,
    frequency: p.frequency,
    coverage_amount: p.coverage_amount ?? null,
    is_active: p.is_active ?? true,
  }))
  const profileForTax: ProfileForTax = {
    birth_year: profile.birth_year,
    gender: profile.gender as "male" | "female" | null | undefined,
    spouse_profile_id: profile.spouse_profile_id,
    marital_status: profile.marital_status,
  }
  let spouseData: SpouseForTax | null = null
  if (profile.spouse_profile_id) {
    const spouseIncome = lookups.incomeByProfileId.get(profile.spouse_profile_id)
    if (spouseIncome) {
      spouseData = { annual_income: spouseIncome.annual_salary + (spouseIncome.bonus_estimate ?? 0) }
    }
  }

  const taxResult = calculateTax({
    profile: profileForTax,
    profileId: pid,
    incomeConfig: { annual_salary: income.annual_salary, bonus_estimate: income.bonus_estimate ?? 0 },
    insurancePolicies: polsForTax,
    manualReliefs,
    spouse: spouseData,
    dependents: lookups.familyDependents,
    year: currentYear,
  })

  const dependentBreakdown = taxResult.reliefBreakdown?.filter(
    (r) => ["qcr", "wmcr", "parent", "spouse"].includes(r.type) && r.source === "auto",
  ) ?? []
  acc.totalDependentReliefs += dependentBreakdown.reduce((s, r) => s + r.amount, 0)
  acc.totalTaxPayable += taxResult.taxPayable
  acc.totalTaxReliefs += taxResult.totalReliefs
  acc.totalTaxEmploymentIncome += taxResult.employmentIncome
}

function aggregateProfileCpfBalance(
  acc: Accumulator,
  pid: string,
  cpfRows: Array<Record<string, unknown>>,
  cpf: { oa: number; sa: number; ma: number },
  now: Date,
) {
  const latestCpf = cpfRows.find((c) => c.profile_id === pid)
  if (latestCpf) {
    const decodedCpf = decodeCpfBalancesPii(latestCpf as Parameters<typeof decodeCpfBalancesPii>[0])
    acc.totalCpfBalanceOa += decodedCpf.oa ?? 0
    acc.totalCpfBalanceSa += decodedCpf.sa ?? 0
    acc.totalCpfBalanceMa += decodedCpf.ma ?? 0
    return
  }
  const monthsElapsed = now.getMonth() + 1
  acc.totalCpfBalanceOa += cpf.oa * monthsElapsed
  acc.totalCpfBalanceSa += cpf.sa * monthsElapsed
  acc.totalCpfBalanceMa += cpf.ma * monthsElapsed
}

function aggregateProfileHealthcare(acc: Accumulator, pid: string, age: number, lookups: Lookups) {
  const hcConfig = lookups.healthcareByProfile.get(pid) ?? null
  const hcBreakdown = getAnnualHealthcareMaDeduction(age, hcConfig)
  acc.totalHealthcareMsl += hcBreakdown.msl
  acc.totalHealthcareCsl += hcBreakdown.csl
  acc.totalHealthcarePmi += hcBreakdown.pmi
  acc.totalHealthcareAnnual += hcBreakdown.total
}

function aggregateProfileBaseFinancials(acc: Accumulator, pid: string, ctx: BaseAggCtx) {
  const ctxOut = aggregateProfileIncome(acc, pid, ctx)
  if (!ctxOut) return
  const { profile, income, age, cpf } = ctxOut

  const pols = ctx.lookups.insuranceByProfile.get(pid) ?? []
  const insSplit = sumInsuranceOutflowPremiumsSplit(pols)
  acc.totalInsurancePremium += insSplit.insurance + insSplit.ilpFromLegacyPolicies
  acc.totalIlpPremium += sumIlpPremiums(ctx.lookups.ilpByProfile.get(pid) ?? [])

  aggregateProfileLoans(acc, pid, ctx.lookups)
  aggregateProfileSavings(acc, pid, ctx.lookups)
  aggregateProfileTax(acc, pid, profile, income, ctx.lookups, ctx.currentYear)
  aggregateProfileCpfBalance(acc, pid, ctx.cpfRows, cpf, ctx.now)
  aggregateProfileHealthcare(acc, pid, age, ctx.lookups)
}

type EffectiveFlowCtx = {
  lookups: Lookups
  secondary: SecondaryLookups
  monthStr: string
  year: number
  taxReliefRows: Array<{ profile_id: string; year: number; relief_type: string; amount_enc?: string | null }>
}

function aggregateProfileEffectiveFlow(acc: Accumulator, pid: string, ctx: EffectiveFlowCtx) {
  const { lookups, secondary, monthStr, year, taxReliefRows } = ctx

  acc.totalEffectiveInflow += effectiveInflowFromContext(
    pid,
    monthStr,
    year,
    lookups.cashflowByKey,
    lookups.profileById,
    lookups.incomeByProfileId,
  )

  const pols = lookups.insuranceByProfile.get(pid) ?? []
  acc.totalEffectiveOutflow += discretionaryForProfileMonth(pid, monthStr, lookups.cashflowByKey, lookups.giroByProfile)
  const insSplit = sumInsuranceOutflowPremiumsSplit(pols)
  acc.totalEffectiveOutflow += insSplit.insurance + insSplit.ilpFromLegacyPolicies
  acc.totalEffectiveOutflow += sumIlpPremiums(lookups.ilpByProfile.get(pid) ?? [])
  acc.totalEffectiveOutflow += sumLoanMonthlyPayments(
    (lookups.loansByProfile.get(pid) ?? []).map((l) => ({
      principal: l.principal,
      rate_pct: l.rate_pct,
      tenure_months: l.tenure_months,
      use_cpf_oa: l.use_cpf_oa,
      start_date: l.start_date,
    })),
    monthStr,
  )
  acc.totalEffectiveOutflow += lookups.savingsGoalsByProfile.get(pid) ?? 0
  acc.totalEffectiveOutflow += monthlyTaxForProfile(
    pid,
    year,
    lookups.profileById,
    lookups.incomeByProfileId,
    pols,
    lookups.taxReliefByProfileYear.get(`${pid}:${year}`) ?? [],
    secondary.taxEntryByProfileYear,
  )

  const earlyRep = sumEarlyRepaymentsForMonth(secondary.earlyRepsByProfile.get(pid) ?? [], monthStr)
  acc.totalEffectiveOutflow += earlyRep

  const goalContrib = sumGoalContributionsForMonth(secondary.goalContribsByProfile.get(pid) ?? [], monthStr)
  acc.totalGoalContributions += goalContrib
  acc.totalEffectiveOutflow += goalContrib

  const oneTimeIlp = sumOneTimeIlpForMonth(secondary.oneTimeIlpByProfile.get(pid) ?? [], monthStr)
  acc.totalIlpOneTime += oneTimeIlp
  acc.totalEffectiveOutflow += oneTimeIlp

  const taxReliefCash = sumTaxReliefCashForMonth(
    taxReliefRows
      .filter((tr) => tr.profile_id === pid)
      .map((tr) => ({
        relief_type: tr.relief_type,
        amount: decodeTaxReliefInputsPii(tr).amount ?? 0,
        year: tr.year,
      })),
    year,
  )
  acc.totalTaxReliefCashOutflow += taxReliefCash
  acc.totalEffectiveOutflow += taxReliefCash

  const netInvestments = sumNetInvestmentPurchasesForMonth(secondary.investTxnsByProfile.get(pid) ?? [], monthStr)
  acc.totalInvestmentPurchases += netInvestments
  acc.totalEffectiveOutflow += netInvestments
}

/* ------------------------------------------------------------------ */
/*  Section computations                                                */
/* ------------------------------------------------------------------ */

function countDependents(acc: Accumulator, dependents: DependentForTax[]) {
  for (const d of dependents) {
    if (d.relationship === "child") acc.dependentChildCount++
    else acc.dependentParentCount++
  }
}

function addBankInterestAndDividends(
  acc: Accumulator,
  bankRows: Array<{ opening_balance: number | null; interest_rate_pct: number | null }>,
  divRows: Array<{ quantity: number; price: number }>,
) {
  for (const acct of bankRows) {
    const rate = acct.interest_rate_pct ?? 0
    const balance = acct.opening_balance ?? 0
    if (rate > 0 && balance > 0) acc.totalBankInterest += (balance * rate) / 100 / 12
  }
  for (const txn of divRows) acc.totalDividends += txn.quantity * txn.price
}

async function computeCpfHousingTotal(
  supabase: SupabaseClient,
  lookups: Lookups,
  targetProfileIds: string[],
): Promise<number> {
  const allLoanIds: string[] = []
  for (const pid of targetProfileIds) {
    for (const loan of lookups.loansByProfile.get(pid) ?? []) {
      if (loan.use_cpf_oa) allLoanIds.push(loan.id)
    }
  }
  if (allLoanIds.length === 0) return 0
  const { data: housingData } = await supabase
    .from("cpf_housing_usage")
    .select("principal_withdrawn")
    .in("loan_id", allLoanIds)
  let total = 0
  for (const row of housingData ?? []) total += row.principal_withdrawn ?? 0
  return total
}

async function computeLoanOutstanding(
  supabase: SupabaseClient,
  lookups: Lookups,
  targetProfileIds: string[],
): Promise<{ totalLoanOutstanding: number; totalEarlyRepayment: number }> {
  const allLoans: Array<{ id: string; principal: number; rate_pct: number }> = []
  for (const pid of targetProfileIds) {
    for (const loan of lookups.loansByProfile.get(pid) ?? []) {
      allLoans.push({ id: loan.id, principal: loan.principal, rate_pct: loan.rate_pct })
    }
  }
  if (allLoans.length === 0) return { totalLoanOutstanding: 0, totalEarlyRepayment: 0 }

  const loanIds = allLoans.map((l) => l.id)
  const [{ data: repayments }, { data: earlyRepayments }] = await Promise.all([
    supabase.from("loan_repayments").select("loan_id, amount, date").in("loan_id", loanIds).order("date", { ascending: true }),
    supabase.from("loan_early_repayments").select("loan_id, amount, date").in("loan_id", loanIds).order("date", { ascending: true }),
  ])

  let totalLoanOutstanding = 0
  let totalEarlyRepayment = 0
  for (const loan of allLoans) {
    const loanRepayments = (repayments ?? [])
      .filter((r) => r.loan_id === loan.id)
      .map((r) => ({ amount: r.amount, date: r.date }))
    const loanEarlyRepayments = (earlyRepayments ?? [])
      .filter((r) => r.loan_id === loan.id)
      .map((r) => ({ amount: r.amount, date: r.date }))
    totalLoanOutstanding += estimateOutstandingPrincipal(loan.principal, loan.rate_pct, loanRepayments, loanEarlyRepayments)
    for (const ep of loanEarlyRepayments) totalEarlyRepayment += ep.amount
  }
  return { totalLoanOutstanding, totalEarlyRepayment }
}

function computeBankTotal(
  bankRows: Array<{ family_id: string; profile_id: string | null; opening_balance: number | null; locked_amount: number | null }>,
  familyId: string,
  profileId: string | null,
): { bankTotal: number; accountCount: number } {
  const filtered = profileId
    ? bankRows.filter((a) => a.family_id === familyId && (a.profile_id === profileId || a.profile_id === null))
    : bankRows.filter((a) => a.family_id === familyId)
  let bankTotal = 0
  for (const acct of filtered) bankTotal += (acct.opening_balance ?? 0) - (acct.locked_amount ?? 0)
  return { bankTotal, accountCount: filtered.length }
}

function computeTaxGiroDisplay(
  giroScheduleRows: Array<Record<string, unknown>>,
  totalTaxPayable: number,
  currentYear: number,
): { giroMonthlyBase: number; giroNextLabel: string } {
  if (giroScheduleRows.length > 0) {
    let giroTotal = 0
    for (const row of giroScheduleRows) {
      const decoded = decodeTaxGiroSchedulePii(row as Parameters<typeof decodeTaxGiroSchedulePii>[0])
      giroTotal += Number(decoded.total_payable ?? 0)
    }
    const giroMonthlyBase = Math.floor((giroTotal / 12) * 100) / 100
    const firstSchedule = giroScheduleRows[0]
      ? (decodeTaxGiroSchedulePii(giroScheduleRows[0] as Parameters<typeof decodeTaxGiroSchedulePii>[0]).schedule as Array<{ month: string; amount: number }> | null)
      : null
    let giroNextLabel = ""
    if (firstSchedule) {
      const nextIdx = getNextGiroPaymentIndex(firstSchedule)
      giroNextLabel = nextIdx >= 0 ? `Next: ${firstSchedule[nextIdx].month}` : "All paid"
    }
    return { giroMonthlyBase, giroNextLabel }
  }
  if (totalTaxPayable > 0) {
    const computed = calculateGiroSchedule({ taxPayable: totalTaxPayable, year: currentYear })
    const nextIdx = getNextGiroPaymentIndex(computed.schedule)
    const giroNextLabel = nextIdx >= 0 ? `Next: ${computed.schedule[nextIdx].month}` : "All paid"
    return { giroMonthlyBase: computed.monthlyBase, giroNextLabel }
  }
  return { giroMonthlyBase: 0, giroNextLabel: "" }
}

/* ------------------------------------------------------------------ */
/*  Node and edge builders                                              */
/* ------------------------------------------------------------------ */

type NodeBuildContext = {
  acc: Accumulator
  bankTotal: number
  accountCount: number
  cpfTotal: number
  totalCpfMonthly: number
  cpfHousingTotal: number
  totalLoanOutstanding: number
  totalEarlyRepayment: number
  netLiquidValue: number
  ilpFundTotal: number
  monthlyTax: number
  ocbc360MonthlyInterest: number
  ocbc360AnnualRate: number
  giroMonthlyBase: number
  giroNextLabel: string
  healthcareMonthly: number
}

function buildSavingsGoalsBreakdown(acc: Accumulator): string | undefined {
  if (acc.totalSavingsGoalMonthly > 0) {
    return `${fmt(acc.totalSavingsGoalMonthly)}/mth auto + ${fmt(acc.totalGoalContributions)} manual`
  }
  if (acc.totalGoalContributions > 0) {
    return `${fmt(acc.totalGoalContributions)} manual this month`
  }
  return undefined
}

function buildDependentsBreakdown(acc: Accumulator) {
  const depTotal = acc.dependentChildCount + acc.dependentParentCount
  const childWord = acc.dependentChildCount === 1 ? "child" : "children"
  const childPart = acc.dependentChildCount > 0 ? `${acc.dependentChildCount} ${childWord}` : ""
  const parentSuffix = acc.dependentParentCount === 1 ? "" : "s"
  const parentPart = acc.dependentParentCount > 0 ? `${acc.dependentParentCount} parent${parentSuffix}` : ""
  const reliefSuffix = acc.totalDependentReliefs > 0 ? ` · ${fmt(acc.totalDependentReliefs)}/yr relief` : ""
  const breakdown = depTotal > 0 ? [childPart, parentPart].filter(Boolean).join(", ") + reliefSuffix : undefined
  const countSuffix = depTotal === 1 ? "" : "s"
  const amount = depTotal > 0 ? `${depTotal} dependent${countSuffix}` : "None"
  return { amount, breakdown }
}

function buildAllNodes(ctx: NodeBuildContext): Record<string, MoneyFlowNodeData> {
  const { acc } = ctx
  const nodes: Record<string, MoneyFlowNodeData> = {}

  nodes["income"] = {
    amount: `${fmt(acc.totalGrossMonthly)}/mth`,
    breakdown: acc.totalBonus > 0 ? `+ ${fmt(acc.totalBonus)} bonus/yr` : undefined,
    rawAmount: acc.totalGrossMonthly,
    period: "monthly",
  }
  nodes["cpf_alloc"] = {
    amount: `${fmt(ctx.totalCpfMonthly)}/mth`,
    breakdown: `OA ${fmt(acc.totalCpfOa)} / SA ${fmt(acc.totalCpfSa)} / MA ${fmt(acc.totalCpfMa)}`,
    rawAmount: ctx.totalCpfMonthly,
    period: "monthly",
  }
  nodes["cpf_balance"] = {
    amount: fmt(ctx.cpfTotal),
    breakdown: `OA ${fmt(acc.totalCpfBalanceOa)} / SA ${fmt(acc.totalCpfBalanceSa)} / MA ${fmt(acc.totalCpfBalanceMa)}`,
    rawAmount: ctx.cpfTotal,
    period: "total",
  }
  nodes["cpf_retirement"] = {
    amount: fmt(ctx.cpfTotal),
    breakdown: "Projected from current balances",
    rawAmount: ctx.cpfTotal,
    period: "total",
  }
  nodes["cpf_housing"] = {
    amount: ctx.cpfHousingTotal > 0 ? `${fmt(ctx.cpfHousingTotal)} used` : "$0",
    rawAmount: ctx.cpfHousingTotal,
    period: "total",
  }
  nodes["bank_balance"] = {
    amount: fmt(ctx.bankTotal),
    breakdown: `${ctx.accountCount} account${ctx.accountCount === 1 ? "" : "s"}`,
    rawAmount: ctx.bankTotal,
    period: "total",
  }
  nodes["ocbc360"] = {
    amount: `${fmt(Math.round(ctx.ocbc360MonthlyInterest))}/mth`,
    breakdown: `~${(ctx.ocbc360AnnualRate * 100).toFixed(1)}% effective p.a.`,
    rawAmount: ctx.ocbc360MonthlyInterest,
    period: "monthly",
  }
  const forecastValue = ctx.bankTotal + (acc.totalEffectiveInflow - acc.totalEffectiveOutflow) * 6
  nodes["bank_forecast"] = {
    amount: fmt(forecastValue),
    breakdown: "6-month projection",
    rawAmount: forecastValue,
    period: "total",
  }
  nodes["loan_principal"] = { amount: fmt(acc.totalLoanPrincipal), rawAmount: acc.totalLoanPrincipal, period: "total" }
  nodes["loan_monthly"] = { amount: `${fmt(acc.totalLoanMonthly)}/mth`, rawAmount: acc.totalLoanMonthly, period: "monthly" }
  nodes["loan_outstanding"] = { amount: fmt(ctx.totalLoanOutstanding), rawAmount: ctx.totalLoanOutstanding, period: "total" }
  nodes["early_repayment"] = {
    amount: ctx.totalEarlyRepayment > 0 ? fmt(ctx.totalEarlyRepayment) : "$0",
    breakdown: ctx.totalEarlyRepayment > 0 ? "Total early repayments" : "No early repayments",
    rawAmount: ctx.totalEarlyRepayment,
    period: "total",
  }
  nodes["tax_income"] = {
    amount: `${fmt(acc.totalTaxEmploymentIncome)}/yr`,
    breakdown: `Salary ${fmt(acc.totalAnnualSalary)} + Bonus ${fmt(acc.totalBonus)}`,
    rawAmount: acc.totalTaxEmploymentIncome,
    period: "annual",
  }
  nodes["tax_reliefs"] = { amount: `${fmt(acc.totalTaxReliefs)}/yr`, rawAmount: acc.totalTaxReliefs, period: "annual" }
  nodes["tax_payable"] = {
    amount: `${fmt(acc.totalTaxPayable)}/yr`,
    breakdown: `${fmt(Math.round(ctx.monthlyTax))}/mth provision`,
    rawAmount: acc.totalTaxPayable,
    period: "annual",
  }
  nodes["cashflow_in"] = { amount: `${fmt(acc.totalEffectiveInflow)}/mth`, rawAmount: acc.totalEffectiveInflow, period: "monthly" }
  nodes["cashflow_out"] = { amount: `${fmt(acc.totalEffectiveOutflow)}/mth`, rawAmount: acc.totalEffectiveOutflow, period: "monthly" }
  nodes["ilp_premium"] = { amount: `${fmt(acc.totalIlpPremium)}/mth`, rawAmount: acc.totalIlpPremium, period: "monthly" }
  nodes["ilp_value"] = { amount: fmt(ctx.ilpFundTotal), rawAmount: ctx.ilpFundTotal, period: "total" }
  nodes["investments"] = { amount: fmt(ctx.netLiquidValue), breakdown: "Net liquid value", rawAmount: ctx.netLiquidValue, period: "total" }
  nodes["insurance_premium"] = { amount: `${fmt(acc.totalInsurancePremium)}/mth`, rawAmount: acc.totalInsurancePremium, period: "monthly" }
  nodes["insurance_coverage"] = {
    amount: acc.totalAnnualSalary > 0 ? `${fmt(acc.totalAnnualSalary * 9)} needed` : "$0",
    breakdown: "Death coverage benchmark (9× salary)",
    rawAmount: acc.totalAnnualSalary * 9,
    period: "total",
  }
  nodes["savings_goals"] = {
    amount: acc.totalSavingsTarget > 0 ? fmt(acc.totalSavingsTarget) : "$0",
    breakdown: buildSavingsGoalsBreakdown(acc),
    rawAmount: acc.totalSavingsTarget,
    period: "total",
  }
  nodes["ilp_one_time"] = {
    amount: acc.totalIlpOneTime > 0 ? fmt(acc.totalIlpOneTime) : "$0",
    breakdown: acc.totalIlpOneTime > 0 ? "One-time ILP payment this month" : "No one-time ILPs",
    rawAmount: acc.totalIlpOneTime,
    period: "monthly",
  }
  nodes["tax_relief_cash"] = {
    amount: acc.totalTaxReliefCashOutflow > 0 ? `${fmt(acc.totalTaxReliefCashOutflow)}/mth` : "$0",
    breakdown: "SRS + CPF voluntary top-ups (real cash out)",
    rawAmount: acc.totalTaxReliefCashOutflow,
    period: "monthly",
  }
  nodes["dividends"] = {
    amount: acc.totalDividends > 0 ? fmt(acc.totalDividends) : "$0",
    breakdown: acc.totalDividends > 0 ? "Dividend income this month" : "No dividends",
    rawAmount: acc.totalDividends,
    period: "monthly",
  }
  nodes["investment_purchases"] = {
    amount: acc.totalInvestmentPurchases > 0 ? `${fmt(acc.totalInvestmentPurchases)}/mth` : "$0",
    breakdown: "Net stock/ETF buys this month",
    rawAmount: acc.totalInvestmentPurchases,
    period: "monthly",
  }
  nodes["bank_interest"] = {
    amount: acc.totalBankInterest > 0 ? `${fmt(Math.round(acc.totalBankInterest))}/mth` : "$0",
    breakdown: "Estimated from account rates",
    rawAmount: acc.totalBankInterest,
    period: "monthly",
  }
  nodes["take_home"] = {
    amount: `${fmt(acc.totalTakeHome)}/mth`,
    breakdown:
      acc.totalSelfHelp > 0
        ? `Gross ${fmt(acc.totalGrossMonthly)} - CPF ${fmt(acc.totalEmployeeCpf)} - SHG ${fmt(acc.totalSelfHelp)}`
        : `Gross ${fmt(acc.totalGrossMonthly)} - CPF ${fmt(acc.totalEmployeeCpf)}`,
    rawAmount: acc.totalTakeHome,
    period: "monthly",
  }
  nodes["shg_deduction"] = {
    amount: acc.totalSelfHelp > 0 ? `${fmt(acc.totalSelfHelp)}/mth` : "$0",
    breakdown: acc.totalSelfHelp > 0 ? "CDAC/SINDA/MBMF/ECF deduction" : "No SHG fund selected",
    rawAmount: acc.totalSelfHelp,
    period: "monthly",
  }
  nodes["cpf_healthcare"] = {
    amount: acc.totalHealthcareAnnual > 0 ? `${fmt(acc.totalHealthcareAnnual)}/yr` : "$0",
    breakdown:
      acc.totalHealthcareAnnual > 0
        ? `MSL ${fmt(acc.totalHealthcareMsl)} / CSL ${fmt(acc.totalHealthcareCsl)} / ISP ${fmt(acc.totalHealthcarePmi)} · ${fmt(ctx.healthcareMonthly)}/mth from MA`
        : "No healthcare config",
    rawAmount: acc.totalHealthcareAnnual,
    period: "annual",
  }
  nodes["tax_giro"] = {
    amount: ctx.giroMonthlyBase > 0 ? `${fmt(ctx.giroMonthlyBase)}/mth × 12` : "$0",
    breakdown: ctx.giroNextLabel || "No GIRO schedule",
    rawAmount: ctx.giroMonthlyBase,
    period: "monthly",
  }

  const dep = buildDependentsBreakdown(acc)
  nodes["dependents"] = { amount: dep.amount, breakdown: dep.breakdown, rawAmount: acc.totalDependentReliefs, period: "annual" }

  return nodes
}

function buildAllEdges(
  nodes: Record<string, MoneyFlowNodeData>,
  acc: Accumulator,
  ctx: NodeBuildContext,
): Record<string, MoneyFlowEdgeData> {
  const edges: Record<string, MoneyFlowEdgeData> = {}
  GRAPH_LINKS.forEach((link, i) => {
    const edgeId = `e-${link.source}-${link.target}-${i}`
    const sourceData = nodes[link.source]
    const targetData = nodes[link.target]
    if (!sourceData || !targetData) {
      edges[edgeId] = { flowFormula: link.calculationName, rawAmount: 0 }
      return
    }
    edges[edgeId] = generateEdgeFormula(link.source, link.target, link.calculationName, sourceData, targetData, {
      grossMonthly: acc.totalGrossMonthly,
      employeeCpf: acc.totalEmployeeCpf,
      employerCpf: acc.totalEmployerCpf,
      cpfTotal: ctx.totalCpfMonthly,
      selfHelp: acc.totalSelfHelp,
      takeHome: acc.totalTakeHome,
      taxPayable: acc.totalTaxPayable,
      taxReliefs: acc.totalTaxReliefs,
      employmentIncome: acc.totalTaxEmploymentIncome,
      loanMonthly: acc.totalLoanMonthly,
      insurancePremium: acc.totalInsurancePremium,
      ilpPremium: acc.totalIlpPremium,
      monthlyTax: ctx.monthlyTax,
      healthcareMonthly: ctx.healthcareMonthly,
      dependentReliefs: acc.totalDependentReliefs,
      giroMonthlyBase: ctx.giroMonthlyBase,
      childCount: acc.dependentChildCount,
      parentCount: acc.dependentParentCount,
    })
  })
  return edges
}

/* ------------------------------------------------------------------ */
/*  Main entry                                                          */
/* ------------------------------------------------------------------ */

export async function fetchMoneyFlowData(
  supabase: SupabaseClient,
  params: MoneyFlowParams,
): Promise<MoneyFlowPayload> {
  const { profileIds, familyId, profileId } = params
  const targetProfileIds = profileId ? [profileId] : profileIds
  const currentYear = new Date().getFullYear()
  const targetMonth = getCurrentMonth()
  const now = new Date()
  const rangeStart = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, "0")}-01`

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
    investmentsResult,
    dependentsRes,
    healthcareConfigRes,
    taxGiroRes,
  ] = await fetchPrimaryQueries(supabase, profileIds, targetProfileIds, familyId, profileId, currentYear, rangeStart)

  const baseLookups = buildBaseLookups(
    (cashflowRes.data ?? []) as Array<Record<string, unknown>>,
    (profilesRes.data ?? []) as Parameters<typeof buildBaseLookups>[1],
    (incomeRes.data ?? []) as Array<Record<string, unknown>>,
  )
  const policyLookups = buildPolicyLookups(
    (insuranceRes.data ?? []) as Array<Record<string, unknown>>,
    (ilpRes.data ?? []) as Array<Record<string, unknown>>,
    (loansRes.data ?? []) as Array<Record<string, unknown>>,
    (taxReliefRes.data ?? []) as Parameters<typeof buildPolicyLookups>[3],
  )
  const savingsAndDeps = buildSavingsAndDependentLookups(
    (savingsGoalsRes.data ?? []) as Array<Record<string, unknown>>,
    (dependentsRes.data ?? []) as Parameters<typeof buildSavingsAndDependentLookups>[1],
    (healthcareConfigRes.data ?? []) as Array<Record<string, unknown>>,
  )

  const giroAccountIds = new Set((giroRulesRes.data ?? []).map((r) => r.source_bank_account_id))
  const giroAccounts = (bankAccountsRes.data ?? []).filter((a) => giroAccountIds.has(a.id))
  const giroByProfile = buildGiroOutflowByProfile(giroRulesRes.data ?? [], giroAccounts, profileIds)

  const lookups: Lookups = {
    ...baseLookups,
    ...policyLookups,
    ...savingsAndDeps,
    giroByProfile,
  }

  const sharedIlp = sumIlpPremiums(sharedIlpRes.data)

  const acc = makeAccumulator()
  const baseCtx: BaseAggCtx = { lookups, currentYear, now, cpfRows: (cpfRes.data ?? []) as Array<Record<string, unknown>> }
  for (const pid of targetProfileIds) aggregateProfileBaseFinancials(acc, pid, baseCtx)
  countDependents(acc, lookups.familyDependents)
  acc.totalIlpPremium += sharedIlp

  const cpfHousingTotal = await computeCpfHousingTotal(supabase, lookups, targetProfileIds)
  const { totalLoanOutstanding, totalEarlyRepayment } = await computeLoanOutstanding(supabase, lookups, targetProfileIds)

  const monthStr = normalizeMonthKey(targetMonth)
  const year = Number.parseInt(monthStr.slice(0, 4), 10) || currentYear
  const monthDate = new Date(monthStr)
  const nextMonthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)
  const nextMonthStr = nextMonthDate.toISOString().slice(0, 10)
  const loanIdsForEarlyRep = (loansRes.data ?? []).map((l) => l.id as string)
  const goalIdsForContribs = (savingsGoalsRes.data ?? []).map((g) => (g as { id: string }).id)

  const [earlyRepsRes, goalContribsRes, oneTimeIlpRes, investTxnsRes, bankInterestRes, divTxnsRes, taxEntriesRes] =
    await fetchSecondaryQueries(
      supabase,
      targetProfileIds,
      familyId,
      monthStr,
      nextMonthStr,
      loanIdsForEarlyRep,
      goalIdsForContribs,
      year,
    )

  const secondary = buildSecondaryLookups(
    (loansRes.data ?? []) as Array<{ id: string; profile_id: string }>,
    (savingsGoalsRes.data ?? []) as Array<{ id: string; profile_id: string }>,
    earlyRepsRes.data ?? [],
    goalContribsRes.data ?? [],
    (oneTimeIlpRes.data ?? []) as Array<{ profile_id: string; monthly_premium: number; created_at: string }>,
    (investTxnsRes.data ?? []) as Array<{ profile_id: string; type: string; quantity: number; price: number; created_at: string }>,
    taxEntriesRes.data ?? [],
  )

  addBankInterestAndDividends(
    acc,
    bankInterestRes.data ?? [],
    divTxnsRes.data ?? [],
  )

  const flowCtx: EffectiveFlowCtx = {
    lookups,
    secondary,
    monthStr,
    year,
    taxReliefRows: (taxReliefRes.data ?? []) as Array<{ profile_id: string; year: number; relief_type: string; amount_enc?: string | null }>,
  }
  for (const pid of targetProfileIds) aggregateProfileEffectiveFlow(acc, pid, flowCtx)
  acc.totalEffectiveOutflow += sharedIlp

  const { netLiquidValue, ilpFundTotal } = investmentsResult
  const { bankTotal, accountCount } = computeBankTotal(
    (bankAccountsRes.data ?? []) as Array<{ family_id: string; profile_id: string | null; opening_balance: number | null; locked_amount: number | null }>,
    familyId,
    profileId,
  )

  const cpfTotal = acc.totalCpfBalanceOa + acc.totalCpfBalanceSa + acc.totalCpfBalanceMa
  const monthlyTax = acc.totalTaxPayable / 12
  const ocbc360AnnualRate = 0.04
  const ocbc360MonthlyInterest = (bankTotal * ocbc360AnnualRate) / 12
  const totalCpfMonthly = acc.totalEmployeeCpf + acc.totalEmployerCpf
  const healthcareMonthly = Math.round((acc.totalHealthcareAnnual / 12) * 100) / 100

  const { giroMonthlyBase, giroNextLabel } = computeTaxGiroDisplay(
    (taxGiroRes.data ?? []) as Array<Record<string, unknown>>,
    acc.totalTaxPayable,
    currentYear,
  )

  const nodeCtx: NodeBuildContext = {
    acc,
    bankTotal,
    accountCount,
    cpfTotal,
    totalCpfMonthly,
    cpfHousingTotal,
    totalLoanOutstanding,
    totalEarlyRepayment,
    netLiquidValue,
    ilpFundTotal,
    monthlyTax,
    ocbc360MonthlyInterest,
    ocbc360AnnualRate,
    giroMonthlyBase,
    giroNextLabel,
    healthcareMonthly,
  }

  const nodes = buildAllNodes(nodeCtx)
  const edges = buildAllEdges(nodes, acc, nodeCtx)

  const profileNames = targetProfileIds
    .map((pid) => lookups.profileById.get(pid)?.name ?? "")
    .filter(Boolean)
  const profileLabel = profileNames.length > 0 ? profileNames.join(" & ") : "Combined"

  return { nodes, edges, month: targetMonth, profileLabel }
}

function generateEdgeFormula(
  sourceId: string,
  targetId: string,
  calcName: string,
  sourceData: MoneyFlowNodeData,
  targetData: MoneyFlowNodeData,
  ctx: {
    grossMonthly: number
    employeeCpf: number
    employerCpf: number
    cpfTotal: number
    selfHelp: number
    takeHome: number
    taxPayable: number
    taxReliefs: number
    employmentIncome: number
    loanMonthly: number
    insurancePremium: number
    ilpPremium: number
    monthlyTax: number
    healthcareMonthly: number
    dependentReliefs: number
    giroMonthlyBase: number
    childCount: number
    parentCount: number
  },
): MoneyFlowEdgeData {
  const key = `${sourceId}->${targetId}`

  switch (key) {
    case "income->cpf_alloc":
      return { flowFormula: `${fmt(ctx.grossMonthly)} × 37% = ${fmt(ctx.cpfTotal)}`, rawAmount: ctx.cpfTotal }
    case "income->tax_income":
      return { flowFormula: `${fmt(ctx.employmentIncome)}/yr gross`, rawAmount: ctx.employmentIncome }
    case "income->take_home":
      return {
        flowFormula:
          ctx.selfHelp > 0
            ? `${fmt(ctx.grossMonthly)} - ${fmt(ctx.employeeCpf)} CPF - ${fmt(ctx.selfHelp)} SHG = ${fmt(ctx.takeHome)}`
            : `${fmt(ctx.grossMonthly)} - ${fmt(ctx.employeeCpf)} CPF = ${fmt(ctx.takeHome)}`,
        rawAmount: ctx.takeHome,
      }
    case "income->shg_deduction":
      return {
        flowFormula: ctx.selfHelp > 0 ? `${fmt(ctx.grossMonthly)} → ${fmt(ctx.selfHelp)}/mth SHG` : "No SHG fund",
        rawAmount: ctx.selfHelp,
      }
    case "shg_deduction->take_home":
      return {
        flowFormula: ctx.selfHelp > 0 ? `-${fmt(ctx.selfHelp)}/mth deducted` : "$0 SHG deduction",
        rawAmount: ctx.selfHelp,
      }
    case "income->insurance_coverage":
      return { flowFormula: `Salary × 9 = ${fmt((ctx.employmentIncome * 9) / 12 * 12)}`, rawAmount: ctx.employmentIncome }
    case "cpf_alloc->cpf_balance":
      return { flowFormula: `${fmt(ctx.cpfTotal)}/mth accumulates`, rawAmount: ctx.cpfTotal }
    case "cpf_alloc->tax_reliefs":
      return { flowFormula: `${fmt(ctx.employeeCpf * 12)}/yr CPF relief`, rawAmount: ctx.employeeCpf * 12 }
    case "cpf_balance->cpf_retirement":
      return { flowFormula: `${fmt(sourceData.rawAmount)} + future contributions`, rawAmount: sourceData.rawAmount }
    case "cpf_balance->cpf_housing":
      return { flowFormula: `OA withdrawals for housing`, rawAmount: targetData.rawAmount }
    case "cpf_housing->loan_monthly":
      return { flowFormula: `CPF OA → loan repayment`, rawAmount: targetData.rawAmount }
    case "take_home->cashflow_in":
      return { flowFormula: `${fmt(ctx.takeHome)}/mth inflow`, rawAmount: ctx.takeHome }
    case "tax_income->tax_payable":
      return {
        flowFormula: `${fmt(ctx.employmentIncome)} - ${fmt(ctx.taxReliefs)} reliefs → ${fmt(ctx.taxPayable)} tax`,
        rawAmount: ctx.taxPayable,
      }
    case "tax_reliefs->tax_payable":
      return { flowFormula: `-${fmt(ctx.taxReliefs)} reduces chargeable income`, rawAmount: ctx.taxReliefs }
    case "insurance_premium->tax_reliefs":
      return { flowFormula: `Life premium → tax relief`, rawAmount: ctx.insurancePremium * 12 }
    case "insurance_premium->cashflow_out":
      return { flowFormula: `${fmt(ctx.insurancePremium)}/mth premiums`, rawAmount: ctx.insurancePremium }
    case "ilp_premium->cashflow_out":
      return { flowFormula: `${fmt(ctx.ilpPremium)}/mth ILP premiums`, rawAmount: ctx.ilpPremium }
    case "ilp_premium->ilp_value":
      return { flowFormula: `${fmt(ctx.ilpPremium)}/mth → fund accumulation`, rawAmount: ctx.ilpPremium }
    case "loan_monthly->cashflow_out":
      return { flowFormula: `${fmt(ctx.loanMonthly)}/mth repayment`, rawAmount: ctx.loanMonthly }
    case "loan_principal->loan_monthly":
      return { flowFormula: `P × r(1+r)^n / [(1+r)^n - 1]`, rawAmount: ctx.loanMonthly }
    case "loan_principal->loan_outstanding":
      return {
        flowFormula: `${fmt(sourceData.rawAmount)} - repayments = ${fmt(targetData.rawAmount)}`,
        rawAmount: targetData.rawAmount,
      }
    case "early_repayment->loan_outstanding":
      return { flowFormula: `-${fmt(sourceData.rawAmount)} principal reduction`, rawAmount: sourceData.rawAmount }
    case "cashflow_out->ocbc360":
      return { flowFormula: `Spend ≥ $500 → bonus rate`, rawAmount: 0 }
    case "cashflow_in->ocbc360":
      return { flowFormula: `Salary ≥ $1,800 → bonus rate`, rawAmount: 0 }
    case "bank_balance->ocbc360":
      return { flowFormula: `Balance × tiered rates`, rawAmount: targetData.rawAmount }
    case "ocbc360->bank_forecast":
      return {
        flowFormula: `${fmt(Math.round(targetData.rawAmount - sourceData.rawAmount))} projected growth`,
        rawAmount: targetData.rawAmount,
      }
    case "cashflow_in->bank_forecast":
      return { flowFormula: `+${fmt(sourceData.rawAmount)}/mth inflow`, rawAmount: sourceData.rawAmount }
    case "cashflow_out->bank_forecast":
      return { flowFormula: `-${fmt(sourceData.rawAmount)}/mth outflow`, rawAmount: sourceData.rawAmount }
    case "bank_balance->savings_goals":
      return { flowFormula: `Bank funds → goal progress`, rawAmount: 0 }
    case "investments->savings_goals":
      return { flowFormula: `${fmt(sourceData.rawAmount)} investment value`, rawAmount: sourceData.rawAmount }
    case "cpf_healthcare->cpf_balance":
      return {
        flowFormula:
          ctx.healthcareMonthly > 0 ? `${fmt(ctx.healthcareMonthly)}/mth deducted from MA` : "No healthcare deductions",
        rawAmount: ctx.healthcareMonthly,
      }
    case "cpf_healthcare->cpf_retirement":
      return {
        flowFormula:
          ctx.healthcareMonthly > 0
            ? `${fmt(ctx.healthcareMonthly)}/mth reduces MA projection`
            : "No healthcare deductions",
        rawAmount: ctx.healthcareMonthly,
      }
    case "tax_payable->tax_giro":
      return {
        flowFormula:
          ctx.giroMonthlyBase > 0
            ? `${fmt(ctx.taxPayable)} ÷ 12 = ${fmt(ctx.giroMonthlyBase)}/mth GIRO`
            : "No GIRO schedule",
        rawAmount: ctx.giroMonthlyBase,
      }
    case "dependents->tax_reliefs": {
      const childWord = ctx.childCount === 1 ? "child" : "children"
      const childPart = ctx.childCount > 0 ? `${ctx.childCount} ${childWord}` : ""
      const parentSuffix = ctx.parentCount === 1 ? "" : "s"
      const parentPart = ctx.parentCount > 0 ? `${ctx.parentCount} parent${parentSuffix}` : ""
      const sources = [childPart, parentPart].filter(Boolean).join(" + ")
      return {
        flowFormula:
          ctx.dependentReliefs > 0 ? `${fmt(ctx.dependentReliefs)}/yr from ${sources}` : "No dependent reliefs",
        rawAmount: ctx.dependentReliefs,
      }
    }
    case "income->tax_reliefs":
      return { flowFormula: `Spouse relief: $2,000 (if eligible)`, rawAmount: 2000 }
    default:
      return {
        flowFormula: `${fmt(sourceData.rawAmount)} → ${fmt(targetData.rawAmount)}`,
        rawAmount: targetData.rawAmount,
      }
  }
}
