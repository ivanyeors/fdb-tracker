/**
 * Shared pure aggregation functions for cashflow calculations.
 * Used by cashflow-range.ts, overview-data.ts, and computed-bank-balance.ts
 * to compute effective inflow/outflow from pre-fetched data maps.
 */

import { calculateTakeHome } from "@/lib/calculations/take-home"
import type { SelfHelpGroup } from "@/lib/calculations/self-help-group"
import { calculateTax } from "@/lib/calculations/tax"

/* ------------------------------------------------------------------ */
/*  Types for pre-fetched data maps                                    */
/* ------------------------------------------------------------------ */

export type ProfileData = { birth_year: number; name?: string; self_help_group?: string }
export type IncomeData = {
  annual_salary: number
  bonus_estimate: number | null
}
export type InsurancePolicy = {
  premium_amount: number
  frequency: string
  is_active: boolean | null
  deduct_from_outflow: boolean | null
  type: string
  coverage_amount: number | null
}
export type IlpProduct = {
  monthly_premium: number
  premium_payment_mode?: string | null
}
export type LoanData = {
  principal: number
  rate_pct: number
  tenure_months: number
  use_cpf_oa?: boolean
  start_date?: string | null
}
export type TaxRelief = { relief_type: string; amount: number }
export type CashflowRow = {
  inflow: number | null
  outflow: number | null
}

/* ------------------------------------------------------------------ */
/*  GIRO outflow by profile                                            */
/* ------------------------------------------------------------------ */

export { GIRO_OUTFLOW_DESTINATIONS } from "@/lib/api/giro-amounts"

export function buildGiroOutflowByProfile(
  rules:
    | Array<{
        amount: number
        source_bank_account_id: string
        linked_entity_type: string | null
      }>
    | null
    | undefined,
  accounts: Array<{ id: string; profile_id: string | null }> | null | undefined,
  profileIds: string[]
): Map<string, number> {
  const out = new Map<string, number>()
  for (const pid of profileIds) out.set(pid, 0)
  if (!rules?.length) return out

  const profileAccountIds = new Map<string, Set<string>>()
  for (const pid of profileIds) {
    profileAccountIds.set(pid, new Set())
  }
  for (const a of accounts ?? []) {
    if (!a.profile_id) continue
    const set = profileAccountIds.get(a.profile_id)
    if (set) set.add(a.id)
  }

  for (const r of rules) {
    if (r.linked_entity_type != null) continue
    for (const pid of profileIds) {
      const set = profileAccountIds.get(pid)
      if (set?.has(r.source_bank_account_id)) {
        out.set(pid, (out.get(pid) ?? 0) + r.amount)
      }
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/*  Loan monthly payments                                              */
/* ------------------------------------------------------------------ */

/**
 * Sum monthly payments for loans paid from cash (excludes CPF OA loans).
 * CPF OA loans are deducted from CPF, not cash outflow.
 */
export function sumLoanMonthlyPayments(
  loansData: Array<LoanData> | null,
  monthStr?: string,
): number {
  if (!loansData?.length) return 0
  let loans = 0
  for (const loan of loansData) {
    if (loan.use_cpf_oa) continue
    if (loan.start_date && monthStr && loan.start_date > monthStr) continue
    const monthlyRate = loan.rate_pct / 100 / 12
    if (monthlyRate > 0 && loan.tenure_months > 0) {
      loans +=
        (loan.principal * monthlyRate) /
        (1 - Math.pow(1 + monthlyRate, -loan.tenure_months))
    } else if (loan.tenure_months > 0) {
      loans += loan.principal / loan.tenure_months
    }
  }
  return loans
}

/* ------------------------------------------------------------------ */
/*  Insurance premiums split (insurance vs ILP legacy)                 */
/* ------------------------------------------------------------------ */

export function sumInsuranceOutflowPremiumsSplit(
  policies: Array<InsurancePolicy> | null
): { insurance: number; ilpFromLegacyPolicies: number } {
  if (!policies?.length) return { insurance: 0, ilpFromLegacyPolicies: 0 }
  let insurance = 0
  let ilpFromLegacyPolicies = 0
  for (const p of policies) {
    if (!p.is_active || !p.deduct_from_outflow) continue
    const monthlyEq =
      p.frequency === "monthly" ? p.premium_amount : p.premium_amount / 12
    if (p.type === "ilp") ilpFromLegacyPolicies += monthlyEq
    else insurance += monthlyEq
  }
  return { insurance, ilpFromLegacyPolicies }
}

/* ------------------------------------------------------------------ */
/*  ILP premiums                                                       */
/* ------------------------------------------------------------------ */

export function sumIlpPremiums(rows: Array<IlpProduct> | null): number {
  if (!rows?.length) return 0
  return rows.reduce((sum, p) => {
    if (p.premium_payment_mode === "one_time") return sum
    return sum + p.monthly_premium
  }, 0)
}

/* ------------------------------------------------------------------ */
/*  Effective inflow from pre-fetched context                          */
/* ------------------------------------------------------------------ */

export function effectiveInflowFromContext(
  profileId: string,
  monthStr: string,
  year: number,
  cashflowByKey: Map<string, CashflowRow>,
  profileById: Map<string, ProfileData>,
  incomeByProfileId: Map<string, IncomeData>
): number {
  const key = `${profileId}:${monthStr}`
  if (cashflowByKey.has(key)) {
    const row = cashflowByKey.get(key)!
    return row.inflow ?? 0
  }

  const profile = profileById.get(profileId)
  const incomeConfig = incomeByProfileId.get(profileId)
  if (!profile || !incomeConfig || incomeConfig.annual_salary <= 0) {
    return 0
  }

  const result = calculateTakeHome(
    incomeConfig.annual_salary,
    incomeConfig.bonus_estimate ?? 0,
    profile.birth_year,
    year,
    (profile.self_help_group as SelfHelpGroup) ?? "none",
  )
  return result.annualTakeHome / 12
}

/* ------------------------------------------------------------------ */
/*  Monthly tax estimate from context                                  */
/* ------------------------------------------------------------------ */

export type TaxEntryData = {
  actual_amount: number | null
}

/**
 * Monthly tax for a profile. If an actual_amount is recorded in tax_entries
 * for this year, it takes precedence over the calculated estimate.
 */
export function monthlyTaxForProfile(
  profileId: string,
  year: number,
  profileById: Map<string, ProfileData>,
  incomeByProfileId: Map<string, IncomeData>,
  policiesForTax: Array<{
    type: string
    premium_amount: number
    frequency: string
    coverage_amount: number | null
    is_active: boolean | null
  }>,
  manualReliefs: Array<TaxRelief>,
  taxEntryByProfileYear?: Map<string, TaxEntryData>,
): number {
  // Check for user-recorded actual tax first
  const taxEntry = taxEntryByProfileYear?.get(`${profileId}:${year}`)
  if (taxEntry?.actual_amount != null && taxEntry.actual_amount > 0) {
    return taxEntry.actual_amount / 12
  }

  const profile = profileById.get(profileId)
  const incomeConfig = incomeByProfileId.get(profileId)
  if (!profile || !incomeConfig) return 0

  const result = calculateTax({
    profile: { birth_year: profile.birth_year },
    incomeConfig: {
      annual_salary: incomeConfig.annual_salary,
      bonus_estimate: incomeConfig.bonus_estimate ?? 0,
    },
    insurancePolicies: policiesForTax.map((p) => ({
      type: p.type,
      premium_amount: p.premium_amount,
      frequency: p.frequency,
      coverage_amount: p.coverage_amount ?? 0,
      is_active: p.is_active ?? false,
    })),
    manualReliefs: manualReliefs.map((r) => ({
      relief_type: r.relief_type,
      amount: r.amount,
    })),
    year,
  })
  return result.taxPayable / 12
}

/* ------------------------------------------------------------------ */
/*  Discretionary outflow for a profile-month                          */
/* ------------------------------------------------------------------ */

export function discretionaryForProfileMonth(
  profileId: string,
  monthStr: string,
  cashflowByKey: Map<string, CashflowRow>,
  giroByProfile: Map<string, number>
): number {
  const key = `${profileId}:${monthStr}`
  const userOutflow = cashflowByKey.has(key)
    ? (cashflowByKey.get(key)!.outflow ?? 0)
    : 0
  return userOutflow + (giroByProfile.get(profileId) ?? 0)
}

/* ------------------------------------------------------------------ */
/*  Savings goals sum by profile                                       */
/* ------------------------------------------------------------------ */

export function sumSavingsGoals(
  goals: Array<{ monthly_auto_amount: number | null }> | null
): number {
  if (!goals?.length) return 0
  return goals.reduce((sum, g) => sum + (g.monthly_auto_amount ?? 0), 0)
}

/* ------------------------------------------------------------------ */
/*  Early loan repayments by month                                     */
/* ------------------------------------------------------------------ */

export type EarlyRepaymentRow = {
  amount: number
  penalty_amount: number | null
  date: string
}

/**
 * Sum early repayments (amount + penalty) that fall within a given month.
 */
export function sumEarlyRepaymentsForMonth(
  rows: Array<EarlyRepaymentRow> | null,
  monthStr: string,
): number {
  if (!rows?.length) return 0
  const d = new Date(monthStr)
  const y = d.getFullYear()
  const m = d.getMonth()
  let total = 0
  for (const r of rows) {
    const rd = new Date(r.date)
    if (rd.getFullYear() === y && rd.getMonth() === m) {
      total += r.amount + (r.penalty_amount ?? 0)
    }
  }
  return total
}

/* ------------------------------------------------------------------ */
/*  Manual goal contributions by month                                 */
/* ------------------------------------------------------------------ */

export type GoalContributionRow = {
  amount: number
  created_at: string
}

/**
 * Sum manual goal contributions that fall within a given month.
 */
export function sumGoalContributionsForMonth(
  rows: Array<GoalContributionRow> | null,
  monthStr: string,
): number {
  if (!rows?.length) return 0
  const d = new Date(monthStr)
  const y = d.getFullYear()
  const m = d.getMonth()
  let total = 0
  for (const r of rows) {
    const rd = new Date(r.created_at)
    if (rd.getFullYear() === y && rd.getMonth() === m) {
      total += r.amount
    }
  }
  return total
}

/* ------------------------------------------------------------------ */
/*  One-time ILP premiums by month                                     */
/* ------------------------------------------------------------------ */

export type OneTimeIlpRow = {
  monthly_premium: number
  created_at: string
}

/**
 * Sum one-time ILP premiums paid in a given month (using created_at).
 */
export function sumOneTimeIlpForMonth(
  rows: Array<OneTimeIlpRow> | null,
  monthStr: string,
): number {
  if (!rows?.length) return 0
  const d = new Date(monthStr)
  const y = d.getFullYear()
  const m = d.getMonth()
  let total = 0
  for (const r of rows) {
    const rd = new Date(r.created_at)
    if (rd.getFullYear() === y && rd.getMonth() === m) {
      total += r.monthly_premium
    }
  }
  return total
}

/* ------------------------------------------------------------------ */
/*  Tax relief cash outflows (SRS, CPF top-ups)                        */
/* ------------------------------------------------------------------ */

const CASH_RELIEF_TYPES = new Set(["srs", "cpf_topup_self", "cpf_topup_family"])

export type TaxReliefCashRow = {
  relief_type: string
  amount: number
  year: number
}

/**
 * Monthly proration of cash-based tax reliefs (SRS, CPF voluntary top-ups).
 * These are real bank outflows, not just tax deductions.
 */
export function sumTaxReliefCashForMonth(
  rows: Array<TaxReliefCashRow> | null,
  year: number,
): number {
  if (!rows?.length) return 0
  let total = 0
  for (const r of rows) {
    if (r.year === year && CASH_RELIEF_TYPES.has(r.relief_type)) {
      total += r.amount / 12
    }
  }
  return total
}

/* ------------------------------------------------------------------ */
/*  Net investment purchases by month                                  */
/* ------------------------------------------------------------------ */

export type InvestmentTxnRow = {
  type: string
  quantity: number
  price: number
  commission?: number
  created_at: string
}

/**
 * Net investment purchases (buys - sells) for a given month.
 * Returns 0 if net is negative (sold more than bought).
 */
export function sumNetInvestmentPurchasesForMonth(
  rows: Array<InvestmentTxnRow> | null,
  monthStr: string,
): number {
  if (!rows?.length) return 0
  const d = new Date(monthStr)
  const y = d.getFullYear()
  const m = d.getMonth()
  let net = 0
  for (const t of rows) {
    const td = new Date(t.created_at)
    if (td.getFullYear() === y && td.getMonth() === m) {
      const fee = t.commission ?? 0
      if (t.type === "buy") net += t.quantity * t.price + fee
      else if (t.type === "sell") net -= t.quantity * t.price - fee
    }
  }
  return Math.max(0, net)
}

/**
 * Raw net deployment (buys - sells) for a given month, NOT floored at 0.
 * Used for isolating market gain in the waterfall.
 */
export function rawNetDeploymentForMonth(
  rows: Array<InvestmentTxnRow> | null,
  monthStr: string,
): number {
  if (!rows?.length) return 0
  const d = new Date(monthStr)
  const y = d.getFullYear()
  const m = d.getMonth()
  let net = 0
  for (const t of rows) {
    const td = new Date(t.created_at)
    if (td.getFullYear() === y && td.getMonth() === m) {
      const fee = t.commission ?? 0
      if (t.type === "buy") net += t.quantity * t.price + fee
      else if (t.type === "sell") net -= t.quantity * t.price - fee
    }
  }
  return net
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function normalizeMonthKey(month: string): string {
  return month.includes("-01") ? month : `${month}-01`
}

export function yearsInMonths(months: string[]): number[] {
  const ys = new Set<number>()
  for (const mo of months) {
    const y = Number.parseInt(mo.slice(0, 4), 10)
    if (!Number.isNaN(y)) ys.add(y)
  }
  return [...ys]
}
