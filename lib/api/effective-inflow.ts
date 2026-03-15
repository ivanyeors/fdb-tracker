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
