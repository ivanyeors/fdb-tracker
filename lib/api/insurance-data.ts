import type { SupabaseClient } from "@supabase/supabase-js"

export async function fetchInsurancePolicies(
  supabase: SupabaseClient,
  params: { profileIds: string[] }
) {
  const { profileIds } = params

  const { data: policies, error } = await supabase
    .from("insurance_policies")
    .select(
      "*, insurance_policy_coverages(id, coverage_type, coverage_amount, benefit_name, benefit_premium, renewal_bonus, benefit_expiry_date, benefit_unit, sort_order)"
    )
    .in("profile_id", profileIds)
    .order("created_at", { ascending: true })

  if (error) throw new Error("Failed to fetch policies")

  return (policies || []).map((p) => ({
    ...p,
    coverages: p.insurance_policy_coverages ?? [],
    insurance_policy_coverages: undefined,
  }))
}
