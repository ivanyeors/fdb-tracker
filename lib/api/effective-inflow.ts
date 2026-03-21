/**
 * Resolves inflow for a profile for a given month.
 * Uses manual override from monthly_cashflow if set, else derives from income_config
 * (salary + bonus - CPF employee contribution).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { calculateTakeHome } from "@/lib/calculations/take-home"

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

  // Manual override: if user has a cashflow row for this month, use stored inflow
  if (cashflow != null) {
    return cashflow.inflow ?? 0
  }

  // Derive from income_config: income + bonus - CPF
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

  if (!profile || !incomeConfig || incomeConfig.annual_salary <= 0) {
    if (!profile) {
      console.warn(`[effective-inflow] Profile ${profileId} not found or missing birth_year`)
    } else if (!incomeConfig) {
      console.warn(`[effective-inflow] No income_config for profile ${profileId}`)
    }
    return 0
  }

  const result = calculateTakeHome(
    incomeConfig.annual_salary,
    incomeConfig.bonus_estimate ?? 0,
    profile.birth_year,
    year,
  )

  // Use annual take-home / 12 (includes bonus prorated)
  return result.annualTakeHome / 12
}

export type InflowBreakdown = {
  total: number
  salary?: number
  bonus?: number
  income?: number
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

  const { data: cashflow } = await supabase
    .from("monthly_cashflow")
    .select("inflow")
    .eq("profile_id", profileId)
    .eq("month", monthStr)
    .single()

  // Manual override: no breakdown available
  if (cashflow != null) {
    const total = cashflow.inflow ?? 0
    return { total, income: total }
  }

  // Derive from income_config
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

  if (!profile || !incomeConfig || incomeConfig.annual_salary <= 0) {
    return { total: 0 }
  }

  const result = calculateTakeHome(
    incomeConfig.annual_salary,
    incomeConfig.bonus_estimate ?? 0,
    profile.birth_year,
    year,
  )

  const annualSalary = incomeConfig.annual_salary
  const bonus = incomeConfig.bonus_estimate ?? 0
  const totalAnnual = annualSalary + bonus
  const salaryPct = totalAnnual > 0 ? annualSalary / totalAnnual : 1

  const monthlyTotal = result.annualTakeHome / 12
  const salary = Math.round(monthlyTotal * salaryPct * 100) / 100
  const bonusMonthly = bonus > 0 ? Math.round(monthlyTotal * (1 - salaryPct) * 100) / 100 : 0

  return {
    total: monthlyTotal,
    salary,
    bonus: bonus > 0 ? bonusMonthly : undefined,
  }
}
