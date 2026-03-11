import { createSupabaseAdmin } from "@/lib/supabase/server"

export async function getOrCreateHouseholdForChannel(
  chatId: string,
): Promise<string | null> {
  console.log("[household] getOrCreateHouseholdForChannel called with chatId:", chatId)
  
  try {
    const supabase = createSupabaseAdmin()
    console.log("[household] Supabase client created")
    
    const { data: existing, error: selectError } = await supabase
      .from("households")
      .select("id")
      .eq("telegram_chat_id", chatId)
      .maybeSingle()
    
    if (selectError) {
      console.error("[household] Error selecting household:", selectError)
    }
    
    if (existing?.id) {
      console.log("[household] Found existing household:", existing.id)
      return existing.id
    }

    console.log("[household] No existing household, creating new one")
    const { data: created, error } = await supabase
      .from("households")
      .insert({ user_count: 1, telegram_chat_id: chatId })
      .select("id")
      .single()
    
    if (error) {
      console.error("[household] Error creating household:", error)
      console.error("[household] Error details:", JSON.stringify(error, null, 2))
      return null
    }
    
    if (!created) {
      console.error("[household] No data returned from insert")
      return null
    }
    
    console.log("[household] Created new household:", created.id)
    return created.id
  } catch (err) {
    console.error("[household] Unexpected error:", err)
    console.error("[household] Error stack:", err instanceof Error ? err.stack : 'No stack trace')
    return null
  }
}
