import { createSupabaseAdmin } from "@/lib/supabase/server"
import type { Json } from "@/lib/supabase/database.types"

export const supabaseSessionStore = {
  async get(key: string): Promise<Record<string, unknown> | undefined> {
    const supabase = createSupabaseAdmin()
    const { data, error } = await supabase
      .from("telegram_sessions")
      .select("session_data")
      .eq("id", key)
      .maybeSingle()

    if (error) {
      console.error("[telegram_sessions] error getting session:", error.message)
      return undefined
    }

    if (!data) return undefined
    
    // session_data is JSONB, so it's already parsed
    return data.session_data as Record<string, unknown>
  },

  async set(key: string, session: Record<string, unknown>): Promise<void> {
    const supabase = createSupabaseAdmin()
    const { error } = await supabase
      .from("telegram_sessions")
      .upsert({
        id: key,
        session_data: session as Json,
        updated_at: new Date().toISOString(),
      })

    if (error) {
      console.error("[telegram_sessions] error setting session:", error.message)
    }
  },

  async delete(key: string): Promise<void> {
    const supabase = createSupabaseAdmin()
    const { error } = await supabase
      .from("telegram_sessions")
      .delete()
      .eq("id", key)

    if (error) {
      console.error("[telegram_sessions] error deleting session:", error.message)
    }
  },
}
