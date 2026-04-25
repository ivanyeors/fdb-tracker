import { decryptString } from "@/lib/crypto/cipher"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const BOT_TOKEN_ENC_CTX = {
  table: "households",
  column: "telegram_bot_token_enc",
} as const

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>

export interface HouseholdTelegramConfig {
  botToken: string | null
  chatId: string | null
}

/**
 * Reads telegram_bot_token + chat_id for a household, preferring the encrypted
 * column. Falls back to plaintext only when ciphertext is null (idle pre-Phase-1
 * rows) or decryption throws (corrupted ciphertext) — logs and continues.
 */
export async function getHouseholdTelegramConfig(
  supabase: SupabaseAdmin,
  householdId: string,
): Promise<HouseholdTelegramConfig | null> {
  const { data, error } = await supabase
    .from("households")
    .select("telegram_bot_token, telegram_bot_token_enc, telegram_chat_id")
    .eq("id", householdId)
    .single()

  if (error || !data) return null

  return {
    botToken: decryptBotToken(data),
    chatId: data.telegram_chat_id ?? null,
  }
}

export function decryptBotToken(row: {
  telegram_bot_token: string | null
  telegram_bot_token_enc: string | null
}): string | null {
  if (row.telegram_bot_token_enc) {
    try {
      return decryptString(row.telegram_bot_token_enc, BOT_TOKEN_ENC_CTX)
    } catch (err) {
      console.error(
        "[telegram_bot_token] decrypt failed, falling back to plaintext:",
        err,
      )
    }
  }
  return row.telegram_bot_token ?? null
}
