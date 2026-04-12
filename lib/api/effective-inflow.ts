/**
 * Resolves inflow for a profile for a given month.
 * Uses manual override from monthly_cashflow if set, else derives from income_config
 * (salary + bonus - CPF employee contribution).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { calculateTakeHome } from "@/lib/calculations/take-home"
import type { SelfHelpGroup } from "@/lib/calculations/self-help-group"

export async function getEffectiveInflowForProfile(
  supabase: SupabaseClient,
  profileId: string,
  month: string,
): Promise<number> {
  const monthStr = month.includes("-01") ? month : `${month}-01`
  const year = monthStr.slice(0, 4)
    ? parseInt(monthStr.slice(0, 4), 10)
    : new Date().getFullYear()

  const { data: cashflow } = await supabase
    .from("monthly_cashflow")
    .select("inflow")
    .eq("profile_id", profileId)
    .eq("month", monthStr)
    .single()

  let baseInflow = 0

  // Manual override: if user has a cashflow row for this month, use stored inflow
  if (cashflow != null) {
    baseInflow = cashflow.inflow ?? 0
  } else {
    // Derive from income_config: income + bonus - CPF
    const { data: profile } = await supabase
      .from("profiles")
      .select("birth_year, self_help_group")
      .eq("id", profileId)
      .single()

    const { data: incomeConfig } = await supabase
      .from("income_config")
      .select("annual_salary, bonus_estimate")
      .eq("profile_id", profileId)
      .single()

    if (!profile || !incomeConfig || incomeConfig.annual_salary <= 0) {
      if (!profile) {
        console.warn(`[effective-inflow] Profile ${profileId} not found or missing birth_year`)
      } else if (!incomeConfig) {
        console.warn(`[effective-inflow] No income_config for profile ${profileId}`)
      }
    } else {
      const result = calculateTakeHome(
        incomeConfig.annual_salary,
        incomeConfig.bonus_estimate ?? 0,
        profile.birth_year,
        year,
        (profile.self_help_group as SelfHelpGroup) ?? "none",
      )
      baseInflow = result.annualTakeHome / 12
    }
  }

  // Add estimated bank interest from primary bank account
  const bankInterest = await estimateBankInterestForProfile(supabase, profileId)

  return baseInflow + bankInterest
}

/**
 * Estimate monthly bank interest for a profile's bank accounts.
 * Uses the account balance × interest_rate_pct / 100 / 12.
 */
export async function estimateBankInterestForProfile(
  supabase: SupabaseClient,
  profileId: string,
): Promise<number> {
  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("opening_balance, interest_rate_pct")
    .eq("profile_id", profileId)

  if (!accounts) return 0

  let interest = 0
  for (const a of accounts) {
    const rate = a.interest_rate_pct ?? 0
    const balance = a.opening_balance ?? 0
    if (rate > 0 && balance > 0) {
      interest += (balance * rate) / 100 / 12
    }
  }
  return interest
}

export type InflowBreakdown = {
  total: number
  salary?: number
  bonus?: number
  income?: number
  bankInterest?: number
  dividends?: number
}

/**
 * Resolves inflow with optional breakdown for a profile for a given month.
 * When manual override: returns { total, income }.
 * When derived: returns { total, salary?, bonus? } prorated from income_config.
 */
export async function getEffectiveInflowWithBreakdown(
  supabase: SupabaseClient,
  profileId: string,
  month: string,
): Promise<InflowBreakdown> {
  const monthStr = month.includes("-01") ? month : `${month}-01`
  const year = monthStr.slice(0, 4)
    ? parseInt(monthStr.slice(0, 4), 10)
    : new Date().getFullYear()

  // Bank interest (always included)
  const bankInterest = await estimateBankInterestForProfile(supabase, profileId)

  // Dividends for this month
  let dividends = 0
  const { data: profileForFamily } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", profileId)
    .single()
  if (profileForFamily) {
    const monthDate = new Date(monthStr)
    const nextMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)
    const { data: divTxns } = await supabase
      .from("investment_transactions")
      .select("quantity, price")
      .eq("family_id", profileForFamily.family_id)
      .eq("profile_id", profileId)
      .eq("type", "dividend")
      .gte("created_at", monthStr)
      .lt("created_at", nextMonth.toISOString().slice(0, 10))
    if (divTxns) {
      for (const t of divTxns) {
        dividends += t.quantity * t.price
      }
    }
  }

  const { data: cashflow } = await supabase
    .from("monthly_cashflow")
    .select("inflow")
    .eq("profile_id", profileId)
    .eq("month", monthStr)
    .single()

  // Manual override: no salary/bonus breakdown available
  if (cashflow != null) {
    const income = cashflow.inflow ?? 0
    const total = income + bankInterest + dividends
    return {
      total,
      income,
      bankInterest: bankInterest > 0 ? bankInterest : undefined,
      dividends: dividends > 0 ? dividends : undefined,
    }
  }

  // Derive from income_config
  const { data: profile } = await supabase
    .from("profiles")
    .select("birth_year, self_help_group")
    .eq("id", profileId)
    .single()

  const { data: incomeConfig } = await supabase
    .from("income_config")
    .select("annual_salary, bonus_estimate")
    .eq("profile_id", profileId)
    .single()

  if (!profile || !incomeConfig || incomeConfig.annual_salary <= 0) {
    const total = bankInterest + dividends
    return {
      total,
      bankInterest: bankInterest > 0 ? bankInterest : undefined,
      dividends: dividends > 0 ? dividends : undefined,
    }
  }

  const result = calculateTakeHome(
    incomeConfig.annual_salary,
    incomeConfig.bonus_estimate ?? 0,
    profile.birth_year,
    year,
    (profile.self_help_group as SelfHelpGroup) ?? "none",
  )

  const annualSalary = incomeConfig.annual_salary
  const bonus = incomeConfig.bonus_estimate ?? 0
  const totalAnnual = annualSalary + bonus
  const salaryPct = totalAnnual > 0 ? annualSalary / totalAnnual : 1

  const monthlyIncome = result.annualTakeHome / 12
  const salary = Math.round(monthlyIncome * salaryPct * 100) / 100
  const bonusMonthly =
    bonus > 0 ? Math.round(monthlyIncome * (1 - salaryPct) * 100) / 100 : 0

  const total = monthlyIncome + bankInterest + dividends

  return {
    total,
    salary,
    bonus: bonus > 0 ? bonusMonthly : undefined,
    bankInterest: bankInterest > 0 ? bankInterest : undefined,
    dividends: dividends > 0 ? dividends : undefined,
  }
}
