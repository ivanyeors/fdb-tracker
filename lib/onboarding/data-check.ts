import { SupabaseClient } from "@supabase/supabase-js"

import { decodeIncomeConfigPii } from "@/lib/repos/income-config"

const PLACEHOLDER_NAMES = new Set(["person", "user"])

export type DataSufficiencyResult = {
  canSkip: boolean
  hasProfiles: boolean
  hasIncome: boolean
  hasBanks: boolean
}

export async function checkOnboardingDataSufficiency(
  supabase: SupabaseClient,
  householdId: string
): Promise<DataSufficiencyResult> {
  const empty: DataSufficiencyResult = {
    canSkip: false,
    hasProfiles: false,
    hasIncome: false,
    hasBanks: false,
  }

  const { data: family } = await supabase
    .from("families")
    .select("id")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!family) return empty

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("family_id", family.id)

  const hasProfiles =
    (profiles ?? []).length > 0 &&
    (profiles ?? []).some(
      (p) =>
        p.name?.trim() && !PLACEHOLDER_NAMES.has(p.name.trim().toLowerCase())
    )

  if (!hasProfiles) return { ...empty, hasProfiles: false }

  const profileIds = (profiles ?? []).map((p) => p.id)

  const [{ data: incomeRows }, { data: bankRows }] = await Promise.all([
    // Filter applied in JS — annual_salary is encrypted, so SQL .gt would not
    // work. Fetching all rows for the profile is bounded (one row per profile).
    supabase
      .from("income_config")
      .select("annual_salary_enc")
      .in("profile_id", profileIds),
    supabase
      .from("bank_accounts")
      .select("id")
      .eq("family_id", family.id)
      .limit(1),
  ])

  const hasIncome = (incomeRows ?? []).some(
    (r) => (decodeIncomeConfigPii(r).annual_salary ?? 0) > 0,
  )
  const hasBanks = (bankRows ?? []).length > 0
  const canSkip = hasProfiles && hasIncome && hasBanks

  return { canSkip, hasProfiles, hasIncome, hasBanks }
}
