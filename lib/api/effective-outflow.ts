/**
 * Shared helper to compute effective outflow for a profile for a given month.
 * Used by bank-balance, cashflow, and overview APIs.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { calculateTax } from "@/lib/calculations/tax"

export type EffectiveOutflowResult = {
  discretionary: number
  insurance: number
  ilp: number
  loans: number
  tax: number
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
    .select("outflow")
    .eq("profile_id", profileId)
    .eq("month", monthStr)
    .single()

  const discretionary = cashflow?.outflow ?? 0

  let insurance = 0
  const { data: policies } = await supabase
    .from("insurance_policies")
    .select("premium_amount, frequency, is_active, deduct_from_outflow")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .eq("deduct_from_outflow", true)

  if (policies) {
    for (const p of policies) {
      insurance += p.frequency === "monthly" ? p.premium_amount : p.premium_amount / 12
    }
  }

  let ilp = 0
  const { data: ilps } = await supabase
    .from("ilp_products")
    .select("monthly_premium")
    .eq("profile_id", profileId)
  if (ilps) {
    for (const ilpProd of ilps) {
      ilp += ilpProd.monthly_premium
    }
  }

  let loans = 0
  const { data: loansData } = await supabase
    .from("loans")
    .select("id, principal, rate_pct, tenure_months")
    .eq("profile_id", profileId)
  if (loansData) {
    for (const loan of loansData) {
      const monthlyRate = loan.rate_pct / 100 / 12
      if (monthlyRate > 0 && loan.tenure_months > 0) {
        loans +=
          (loan.principal * monthlyRate) /
          (1 - Math.pow(1 + monthlyRate, -loan.tenure_months))
      } else if (loan.tenure_months > 0) {
        loans += loan.principal / loan.tenure_months
      }
    }
  }

  let tax = 0
  const { data: profile } = await supabase
    .from("profiles")
    .select("birth_year")
    .eq("id", profileId)
    .single()
  const { data: incomeConfig } = await supabase
    .from("income_config")
    .select("annual_salary, bonus_estimate")
    .eq("profile_id", profileId)
    .single()
  const { data: insurancePolicies } = await supabase
    .from("insurance_policies")
    .select("type, premium_amount, frequency, coverage_amount, is_active")
    .eq("profile_id", profileId)
  const { data: manualReliefs } = await supabase
    .from("tax_relief_inputs")
    .select("relief_type, amount")
    .eq("profile_id", profileId)
    .eq("year", year)

  if (profile && incomeConfig) {
    const result = calculateTax({
      profile: { birth_year: profile.birth_year },
      incomeConfig: {
        annual_salary: incomeConfig.annual_salary,
        bonus_estimate: incomeConfig.bonus_estimate ?? 0,
      },
      insurancePolicies: (insurancePolicies ?? []).map((p) => ({
        type: p.type,
        premium_amount: p.premium_amount,
        frequency: p.frequency,
        coverage_amount: p.coverage_amount ?? 0,
        is_active: p.is_active,
      })),
      manualReliefs: (manualReliefs ?? []).map((r) => ({
        relief_type: r.relief_type,
        amount: r.amount,
      })),
      year,
    })
    tax = result.taxPayable / 12
  }

  const total = discretionary + insurance + ilp + loans + tax

  return {
    discretionary,
    insurance,
    ilp,
    loans,
    tax,
    total,
  }
}
