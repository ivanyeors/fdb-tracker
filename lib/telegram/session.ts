import { decryptJson, encryptJson } from "@/lib/crypto/cipher"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import type { Json } from "@/lib/supabase/database.types"

const SESSION_ENC_CTX = {
  table: "telegram_sessions",
  column: "session_data_enc",
} as const

export const supabaseSessionStore = {
  async get(key: string): Promise<Record<string, unknown> | undefined> {
    const supabase = createSupabaseAdmin()
    const { data, error } = await supabase
      .from("telegram_sessions")
      .select("session_data, session_data_enc")
      .eq("id", key)
      .maybeSingle()

    if (error) {
      console.error("[telegram_sessions] error getting session:", error.message)
      return undefined
    }

    if (!data) return undefined

    if (data.session_data_enc) {
      try {
        return decryptJson<Record<string, unknown>>(
          data.session_data_enc,
          SESSION_ENC_CTX,
        )
      } catch (err) {
        console.error(
          "[telegram_sessions] decrypt failed, falling back to plaintext:",
          err,
        )
      }
    }

    // Fallback for empty `{}` blobs that the backfill intentionally skipped,
    // or any row that pre-dates dual-write and slipped through.
    return data.session_data as Record<string, unknown>
  },

  async set(key: string, session: Record<string, unknown>): Promise<void> {
    const supabase = createSupabaseAdmin()
    const sessionEnc = encryptJson(session, SESSION_ENC_CTX)
    const { error } = await supabase
      .from("telegram_sessions")
      .upsert({
        id: key,
        session_data: session as Json,
        session_data_enc: sessionEnc,
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
