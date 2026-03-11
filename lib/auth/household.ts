import { createSupabaseAdmin } from "@/lib/supabase/server"

export type HouseholdResult =
  | { id: string; error?: never }
  | { id?: never; error: string }

export async function getOrCreateHouseholdForChannel(
  chatId: string,
): Promise<HouseholdResult> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[household] SUPABASE_SERVICE_ROLE_KEY is not set")
    return { error: "Server misconfigured (missing service role key)" }
  }

  const supabase = createSupabaseAdmin()

  const { data: existing, error: selectError } = await supabase
    .from("households")
    .select("id")
    .eq("telegram_chat_id", chatId)
    .maybeSingle()

  if (selectError) {
    console.error("[household] SELECT error for chatId", chatId, selectError)
    return { error: `DB lookup failed: ${selectError.message}` }
  }

  if (existing?.id) return { id: existing.id }

  const { data: created, error: insertError } = await supabase
    .from("households")
    .insert({ user_count: 1, telegram_chat_id: chatId })
    .select("id")
    .single()

  if (insertError || !created) {
    console.error("[household] INSERT error for chatId", chatId, insertError)
    return {
      error: `DB insert failed: ${insertError?.message ?? "no data returned"}`,
    }
  }

  return { id: created.id }
}
