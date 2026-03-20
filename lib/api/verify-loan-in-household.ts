import { createSupabaseAdmin } from "@/lib/supabase/server"

type Supabase = ReturnType<typeof createSupabaseAdmin>

export async function verifyLoanInHousehold(
  supabase: Supabase,
  householdId: string,
  loanId: string,
): Promise<{ id: string; profile_id: string } | null> {
  const { data: loan } = await supabase
    .from("loans")
    .select("id, profile_id")
    .eq("id", loanId)
    .single()
  if (!loan) return null
  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", loan.profile_id)
    .single()
  if (!profile) return null
  const { data: family } = await supabase
    .from("families")
    .select("id")
    .eq("id", profile.family_id)
    .eq("household_id", householdId)
    .single()
  return family ? loan : null
}
