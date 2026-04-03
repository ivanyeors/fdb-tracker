import type { SupabaseClient } from "@supabase/supabase-js"

export async function fetchTransactions(
  supabase: SupabaseClient,
  params: {
    familyId: string
    profileId: string | null
    limit?: number
    symbol?: string
    type?: "buy" | "sell"
  }
) {
  const { familyId, profileId, limit = 50, symbol, type } = params

  let query = supabase
    .from("investment_transactions")
    .select("*")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (symbol) query = query.eq("symbol", symbol)
  if (type) query = query.eq("type", type)
  if (profileId) {
    query = query.or(`profile_id.eq.${profileId},profile_id.is.null`)
  }

  const { data, error } = await query

  if (error) throw new Error("Failed to fetch transactions")

  return data || []
}
