/**
 * Shared helper to compute effective outflow for a profile for a given month.
 * Used by bank-balance, cashflow, and overview APIs.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { calculateTax } from "@/lib/calculations/tax"
import { getGiroOutflowForProfile } from "@/lib/api/giro-amounts"
import { decodeIncomeConfigPii } from "@/lib/repos/income-config"
import { decodeInsurancePoliciesPii } from "@/lib/repos/insurance-policies"
import { decodeLoanPii } from "@/lib/repos/loans"
import { decodeMonthlyCashflowPii } from "@/lib/repos/monthly-cashflow"
import { decodeTaxReliefInputsPii } from "@/lib/repos/tax-relief-inputs"

/**
 * Sum of monthly premiums for shared ILP products (profile_id is null) in a family.
 * Used by cashflow API to avoid double-counting when aggregating per-profile.
 */
export async function getSharedIlpTotalForFamily(
  supabase: SupabaseClient,
  familyId: string
): Promise<number> {
  const { data: ilps } = await supabase
    .from("ilp_products")
    .select("monthly_premium, premium_payment_mode")
    .eq("family_id", familyId)
    .is("profile_id", null)
  if (!ilps) return 0
  return ilps.reduce((sum, p) => {
    if (p.premium_payment_mode === "one_time") return sum
    return sum + p.monthly_premium
  }, 0)
}

export type EffectiveOutflowResult = {
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
  total: number
}

type LoanRow = {
  id: string
  principal?: number | null
  principal_enc?: string | null
  rate_pct: number
  tenure_months: number
  use_cpf_oa: boolean
}

function monthRange(monthStr: string): { start: string; end: string } {
  const monthDate = new Date(monthStr)
  const next = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)
  return { start: monthStr, end: next.toISOString().slice(0, 10) }
}

async function getDiscretionaryOutflow(
  supabase: SupabaseClient,
  profileId: string,
  monthStr: string,
): Promise<number> {
  const { data: cashflow } = await supabase
    .from("monthly_cashflow")
    .select("outflow_enc")
    .eq("profile_id", profileId)
    .eq("month", monthStr)
    .single()
  const userOutflow = cashflow ? decodeMonthlyCashflowPii(cashflow).outflow ?? 0 : 0
  const giroOutflow = await getGiroOutflowForProfile(supabase, profileId)
  return userOutflow + giroOutflow
}

async function getInsuranceAndIlpFromPolicies(
  supabase: SupabaseClient,
  profileId: string,
): Promise<{ insurance: number; ilp: number }> {
  const { data: policies } = await supabase
    .from("insurance_policies")
    .select(
      "premium_amount_enc, frequency, is_active, deduct_from_outflow, type, end_date",
    )
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .eq("deduct_from_outflow", true)

  let insurance = 0
  let ilp = 0
  if (!policies) return { insurance, ilp }
  const now = new Date().toISOString().slice(0, 10)
  for (const p of policies) {
    if (p.end_date && p.end_date < now) continue
    const premium = decodeInsurancePoliciesPii(p).premium_amount ?? 0
    const monthlyEq = p.frequency === "monthly" ? premium : premium / 12
    if (p.type === "ilp") {
      ilp += monthlyEq
    } else {
      insurance += monthlyEq
    }
  }
  return { insurance, ilp }
}

async function getRecurringIlpPremiums(
  supabase: SupabaseClient,
  profileId: string,
): Promise<number> {
  const { data: ilps } = await supabase
    .from("ilp_products")
    .select("monthly_premium, premium_payment_mode")
    .eq("profile_id", profileId)
  if (!ilps) return 0
  let total = 0
  for (const ilpProd of ilps) {
    if (ilpProd.premium_payment_mode === "one_time") continue
    total += ilpProd.monthly_premium
  }
  return total
}

function loanMonthlyPayment(loan: LoanRow): number {
  const principal = decodeLoanPii(loan).principal ?? 0
  const monthlyRate = loan.rate_pct / 100 / 12
  if (monthlyRate > 0 && loan.tenure_months > 0) {
    return (
      (principal * monthlyRate) /
      (1 - Math.pow(1 + monthlyRate, -loan.tenure_months))
    )
  }
  if (loan.tenure_months > 0) {
    return principal / loan.tenure_months
  }
  return 0
}

function sumLoanMonthlyPayments(loansData: LoanRow[] | null): number {
  if (!loansData) return 0
  let total = 0
  for (const loan of loansData) {
    if (loan.use_cpf_oa) continue
    total += loanMonthlyPayment(loan)
  }
  return total
}

async function getSavingsGoalsTotal(
  supabase: SupabaseClient,
  profileId: string,
  monthStr: string,
): Promise<number> {
  const { data: goals } = await supabase
    .from("savings_goals")
    .select("id, monthly_auto_amount")
    .eq("profile_id", profileId)
  if (!goals) return 0

  let total = 0
  for (const g of goals) total += g.monthly_auto_amount ?? 0

  if (goals.length === 0) return total

  const goalIds = goals.map((g) => g.id)
  const { start, end } = monthRange(monthStr)
  const { data: contributions } = await supabase
    .from("goal_contributions")
    .select("amount")
    .in("goal_id", goalIds)
    .gte("created_at", start)
    .lt("created_at", end)
  if (contributions) {
    for (const c of contributions) total += c.amount
  }
  return total
}

async function getEarlyRepayments(
  supabase: SupabaseClient,
  loansData: LoanRow[] | null,
  monthStr: string,
): Promise<number> {
  if (!loansData || loansData.length === 0) return 0
  const loanIds = loansData.map((l) => l.id)
  const { start, end } = monthRange(monthStr)
  const { data: earlyReps } = await supabase
    .from("loan_early_repayments")
    .select("amount, penalty_amount")
    .in("loan_id", loanIds)
    .gte("date", start)
    .lt("date", end)
  if (!earlyReps) return 0
  let total = 0
  for (const r of earlyReps) total += r.amount + (r.penalty_amount ?? 0)
  return total
}

async function getOneTimeIlpForMonth(
  supabase: SupabaseClient,
  profileId: string,
  monthStr: string,
): Promise<number> {
  const { data: oneTimeIlps } = await supabase
    .from("ilp_products")
    .select("monthly_premium, created_at")
    .eq("profile_id", profileId)
    .eq("premium_payment_mode", "one_time")
  if (!oneTimeIlps) return 0
  const monthDate = new Date(monthStr)
  const next = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)
  let total = 0
  for (const p of oneTimeIlps) {
    const createdDate = new Date(p.created_at)
    if (createdDate >= monthDate && createdDate < next) {
      total += p.monthly_premium
    }
  }
  return total
}

async function getTaxReliefCashMonthly(
  supabase: SupabaseClient,
  profileId: string,
  year: number,
): Promise<number> {
  const cashReliefTypes = ["srs", "cpf_topup_self", "cpf_topup_family"]
  const { data: cashReliefs } = await supabase
    .from("tax_relief_inputs")
    .select("amount_enc")
    .eq("profile_id", profileId)
    .eq("year", year)
    .in("relief_type", cashReliefTypes)
  if (!cashReliefs) return 0
  let total = 0
  for (const r of cashReliefs) {
    total += (decodeTaxReliefInputsPii(r).amount ?? 0) / 12
  }
  return total
}

async function getNetInvestmentOutflow(
  supabase: SupabaseClient,
  profileId: string,
  monthStr: string,
): Promise<number> {
  const { data: profileForFamily } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", profileId)
    .single()
  if (!profileForFamily) return 0

  const { start, end } = monthRange(monthStr)
  const { data: txns } = await supabase
    .from("investment_transactions")
    .select("type, quantity, price")
    .eq("family_id", profileForFamily.family_id)
    .eq("profile_id", profileId)
    .gte("created_at", start)
    .lt("created_at", end)
  if (!txns) return 0
  let net = 0
  for (const t of txns) {
    if (t.type === "buy") net += t.quantity * t.price
    else if (t.type === "sell") net -= t.quantity * t.price
  }
  return Math.max(0, net)
}

async function calculateMonthlyTaxEstimate(
  supabase: SupabaseClient,
  profileId: string,
  year: number,
): Promise<number> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("birth_year")
    .eq("id", profileId)
    .single()
  const { data: incomeConfig } = await supabase
    .from("income_config")
    .select("annual_salary_enc, bonus_estimate_enc")
    .eq("profile_id", profileId)
    .single()
  const { data: insurancePolicies } = await supabase
    .from("insurance_policies")
    .select(
      "type, premium_amount_enc, frequency, coverage_amount_enc, is_active",
    )
    .eq("profile_id", profileId)
  const { data: manualReliefs } = await supabase
    .from("tax_relief_inputs")
    .select("relief_type, amount_enc")
    .eq("profile_id", profileId)
    .eq("year", year)

  if (!profile) {
    console.warn(`[effective-outflow] Profile ${profileId} not found — tax estimate skipped`)
    return 0
  }
  if (!incomeConfig) {
    console.warn(`[effective-outflow] No income_config for profile ${profileId} — tax estimate skipped`)
    return 0
  }

  const decodedIncome = decodeIncomeConfigPii(incomeConfig)
  const result = calculateTax({
    profile: { birth_year: profile.birth_year },
    incomeConfig: {
      annual_salary: decodedIncome.annual_salary ?? 0,
      bonus_estimate: decodedIncome.bonus_estimate ?? 0,
    },
    insurancePolicies: (insurancePolicies ?? []).map((p) => {
      const dec = decodeInsurancePoliciesPii(p)
      return {
        type: p.type,
        premium_amount: dec.premium_amount ?? 0,
        frequency: p.frequency,
        coverage_amount: dec.coverage_amount ?? 0,
        is_active: p.is_active,
      }
    }),
    manualReliefs: (manualReliefs ?? []).map((r) => ({
      relief_type: r.relief_type,
      amount: decodeTaxReliefInputsPii(r).amount ?? 0,
    })),
    year,
  })
  return result.taxPayable / 12
}

async function getMonthlyTax(
  supabase: SupabaseClient,
  profileId: string,
  year: number,
): Promise<number> {
  const { data: taxEntry } = await supabase
    .from("tax_entries")
    .select("actual_amount")
    .eq("profile_id", profileId)
    .eq("year", year)
    .single()
  if (taxEntry?.actual_amount != null && taxEntry.actual_amount > 0) {
    return taxEntry.actual_amount / 12
  }
  return calculateMonthlyTaxEstimate(supabase, profileId, year)
}

export async function getEffectiveOutflowForProfile(
  supabase: SupabaseClient,
  profileId: string,
  month: string,
): Promise<EffectiveOutflowResult> {
  const parts = month.split("-")
  const year = parts[0] ? Number.parseInt(parts[0], 10) : new Date().getFullYear()
  const monthStr = month.includes("-01") ? month : `${month}-01`

  const { data: loansData } = await supabase
    .from("loans")
    .select("id, principal, principal_enc, rate_pct, tenure_months, use_cpf_oa")
    .eq("profile_id", profileId)

  const [
    discretionary,
    policyTotals,
    recurringIlp,
    savingsGoals,
    earlyRepayments,
    ilpOneTime,
    taxReliefCash,
    investments,
    tax,
  ] = await Promise.all([
    getDiscretionaryOutflow(supabase, profileId, monthStr),
    getInsuranceAndIlpFromPolicies(supabase, profileId),
    getRecurringIlpPremiums(supabase, profileId),
    getSavingsGoalsTotal(supabase, profileId, monthStr),
    getEarlyRepayments(supabase, loansData as LoanRow[] | null, monthStr),
    getOneTimeIlpForMonth(supabase, profileId, monthStr),
    getTaxReliefCashMonthly(supabase, profileId, year),
    getNetInvestmentOutflow(supabase, profileId, monthStr),
    getMonthlyTax(supabase, profileId, year),
  ])

  const insurance = policyTotals.insurance
  const ilp = policyTotals.ilp + recurringIlp
  const loans = sumLoanMonthlyPayments(loansData as LoanRow[] | null)

  const total =
    discretionary +
    insurance +
    ilp +
    ilpOneTime +
    loans +
    earlyRepayments +
    tax +
    taxReliefCash +
    savingsGoals +
    investments

  return {
    discretionary,
    insurance,
    ilp,
    ilpOneTime,
    loans,
    earlyRepayments,
    tax,
    taxReliefCash,
    savingsGoals,
    investments,
    total,
  }
}
