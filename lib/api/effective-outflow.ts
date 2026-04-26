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

export async function getEffectiveOutflowForProfile(
  supabase: SupabaseClient,
  profileId: string,
  month: string
): Promise<EffectiveOutflowResult> {
  const parts = month.split("-")
  const year = parts[0] ? parseInt(parts[0], 10) : new Date().getFullYear()
  const monthStr = month.includes("-01") ? month : `${month}-01`

  const { data: cashflow } = await supabase
    .from("monthly_cashflow")
    .select("outflow, outflow_enc")
    .eq("profile_id", profileId)
    .eq("month", monthStr)
    .single()

  // monthly_cashflow.outflow: user-reported discretionary outflow.
  // The user inputs their variable spending, and we ADDD fixed costs on top of it.
  const userOutflow = cashflow ? decodeMonthlyCashflowPii(cashflow).outflow ?? 0 : 0
  const giroOutflow = await getGiroOutflowForProfile(supabase, profileId)
  const discretionary = userOutflow + giroOutflow

  let insurance = 0
  let ilp = 0
  const { data: policies } = await supabase
    .from("insurance_policies")
    .select(
      "premium_amount, premium_amount_enc, frequency, is_active, deduct_from_outflow, type, end_date",
    )
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .eq("deduct_from_outflow", true)

  const now = new Date().toISOString().slice(0, 10)
  if (policies) {
    for (const p of policies) {
      // Skip expired policies even if is_active hasn't been toggled yet
      if (p.end_date && p.end_date < now) continue
      const premium = decodeInsurancePoliciesPii(p).premium_amount ?? 0
      const monthlyEq = p.frequency === "monthly" ? premium : premium / 12
      if (p.type === "ilp") {
        ilp += monthlyEq
      } else {
        insurance += monthlyEq
      }
    }
  }

  // Legacy insurance_policies.type = ilp premiums count toward `ilp` (same bucket as ilp_products).

  const { data: ilps } = await supabase
    .from("ilp_products")
    .select("monthly_premium, premium_payment_mode")
    .eq("profile_id", profileId)
  if (ilps) {
    for (const ilpProd of ilps) {
      if (ilpProd.premium_payment_mode === "one_time") continue
      ilp += ilpProd.monthly_premium
    }
  }

  let loans = 0
  const { data: loansData } = await supabase
    .from("loans")
    .select("id, principal, principal_enc, rate_pct, tenure_months, use_cpf_oa")
    .eq("profile_id", profileId)
  if (loansData) {
    for (const loan of loansData) {
      if (loan.use_cpf_oa) continue
      const principal = decodeLoanPii(loan).principal ?? 0
      const monthlyRate = loan.rate_pct / 100 / 12
      if (monthlyRate > 0 && loan.tenure_months > 0) {
        loans +=
          (principal * monthlyRate) /
          (1 - Math.pow(1 + monthlyRate, -loan.tenure_months))
      } else if (loan.tenure_months > 0) {
        loans += principal / loan.tenure_months
      }
    }
  }

  // Savings goals: monthly_auto_amount + manual contributions for this month
  let savingsGoals = 0
  const { data: goals } = await supabase
    .from("savings_goals")
    .select("id, monthly_auto_amount")
    .eq("profile_id", profileId)
  if (goals) {
    for (const g of goals) {
      savingsGoals += g.monthly_auto_amount ?? 0
    }

    // Add manual goal contributions for this month
    if (goals.length > 0) {
      const goalIds = goals.map((g) => g.id)
      const monthDate = new Date(monthStr)
      const nextMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)
      const { data: contributions } = await supabase
        .from("goal_contributions")
        .select("amount")
        .in("goal_id", goalIds)
        .gte("created_at", monthStr)
        .lt("created_at", nextMonth.toISOString().slice(0, 10))
      if (contributions) {
        for (const c of contributions) {
          savingsGoals += c.amount
        }
      }
    }
  }

  // Early loan repayments (cash portion only) for this month
  let earlyRepayments = 0
  if (loansData && loansData.length > 0) {
    const loanIds = loansData.map((l) => l.id)
    const monthDate = new Date(monthStr)
    const nextMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)
    const { data: earlyReps } = await supabase
      .from("loan_early_repayments")
      .select("amount, penalty_amount")
      .in("loan_id", loanIds)
      .gte("date", monthStr)
      .lt("date", nextMonth.toISOString().slice(0, 10))
    if (earlyReps) {
      for (const r of earlyReps) {
        earlyRepayments += r.amount + (r.penalty_amount ?? 0)
      }
    }
  }

  // One-time ILP premiums paid in this month
  let ilpOneTime = 0
  const { data: oneTimeIlps } = await supabase
    .from("ilp_products")
    .select("monthly_premium, created_at")
    .eq("profile_id", profileId)
    .eq("premium_payment_mode", "one_time")
  if (oneTimeIlps) {
    const monthDate = new Date(monthStr)
    const nextMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)
    for (const p of oneTimeIlps) {
      const createdDate = new Date(p.created_at)
      if (createdDate >= monthDate && createdDate < nextMonth) {
        ilpOneTime += p.monthly_premium
      }
    }
  }

  // Tax relief cash outflows (SRS, CPF top-ups) — real cash leaving the bank
  let taxReliefCash = 0
  const cashReliefTypes = ["srs", "cpf_topup_self", "cpf_topup_family"]
  const { data: cashReliefs } = await supabase
    .from("tax_relief_inputs")
    .select("amount_enc")
    .eq("profile_id", profileId)
    .eq("year", year)
    .in("relief_type", cashReliefTypes)
  if (cashReliefs) {
    for (const r of cashReliefs) {
      taxReliefCash += (decodeTaxReliefInputsPii(r).amount ?? 0) / 12
    }
  }

  // Net investment purchases for this month (buys - sells)
  let investments = 0
  const { data: profileForFamily } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", profileId)
    .single()
  if (profileForFamily) {
    const monthDate = new Date(monthStr)
    const nextMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)
    const { data: txns } = await supabase
      .from("investment_transactions")
      .select("type, quantity, price")
      .eq("family_id", profileForFamily.family_id)
      .eq("profile_id", profileId)
      .gte("created_at", monthStr)
      .lt("created_at", nextMonth.toISOString().slice(0, 10))
    if (txns) {
      for (const t of txns) {
        if (t.type === "buy") {
          investments += t.quantity * t.price
        } else if (t.type === "sell") {
          investments -= t.quantity * t.price
        }
      }
    }
    // Net investments can be negative (sold more than bought) — clamp to 0 for outflow
    investments = Math.max(0, investments)
  }

  // Tax: prefer user-recorded actual amount, fallback to calculated estimate
  let tax = 0
  const { data: taxEntry } = await supabase
    .from("tax_entries")
    .select("actual_amount")
    .eq("profile_id", profileId)
    .eq("year", year)
    .single()

  if (taxEntry?.actual_amount != null && taxEntry.actual_amount > 0) {
    // User has recorded actual tax — use it as source of truth
    tax = taxEntry.actual_amount / 12
  } else {
    // Fallback to calculated estimate
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
        "type, premium_amount, premium_amount_enc, frequency, coverage_amount, coverage_amount_enc, is_active",
      )
      .eq("profile_id", profileId)
    const { data: manualReliefs } = await supabase
      .from("tax_relief_inputs")
      .select("relief_type, amount_enc")
      .eq("profile_id", profileId)
      .eq("year", year)

    if (!profile || !incomeConfig) {
      if (!profile) {
        console.warn(`[effective-outflow] Profile ${profileId} not found — tax estimate skipped`)
      } else if (!incomeConfig) {
        console.warn(`[effective-outflow] No income_config for profile ${profileId} — tax estimate skipped`)
      }
    }

    if (profile && incomeConfig) {
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
      tax = result.taxPayable / 12
    }
  }

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
