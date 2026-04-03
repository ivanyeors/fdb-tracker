import type { SupabaseClient } from "@supabase/supabase-js"

export async function fetchGoals(
  supabase: SupabaseClient,
  params: { familyId: string; profileId: string | null }
) {
  const { familyId, profileId } = params

  let query = supabase
    .from("savings_goals")
    .select("*, goal_contributions(id, amount, source, created_at)")
    .eq("family_id", familyId)
    .order("created_at", { ascending: true })

  if (profileId) {
    query = query.or(`profile_id.eq.${profileId},profile_id.is.null`)
  }

  const { data: goals, error } = await query

  if (error) throw new Error("Failed to fetch goals")

  return goals || []
}
