import { createSupabaseAdmin } from "@/lib/supabase/server"

export async function getOrCreateHouseholdForChannel(
  chatId: string,
): Promise<string | null> {
  const supabase = createSupabaseAdmin()
  const { data: existing } = await supabase
    .from("households")
    .select("id")
    .eq("telegram_chat_id", chatId)
    .maybeSingle()
  if (existing?.id) return existing.id

  const { data: created, error } = await supabase
    .from("households")
    .insert({ user_count: 1, telegram_chat_id: chatId })
    .select("id")
    .single()
  if (error || !created) return null
  return created.id
}
