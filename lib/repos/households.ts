import { encryptStringNullable } from "@/lib/crypto/cipher"
import {
  deterministicHashNullable,
  normalizeTelegramId,
} from "@/lib/crypto/hash"

export interface HouseholdPiiInput {
  telegram_chat_id?: string | null
}

export function encodeHouseholdPiiPatch(input: HouseholdPiiInput): {
  telegram_chat_id_enc?: string | null
  telegram_chat_id_hash?: string | null
} {
  const out: Record<string, string | null> = {}

  if ("telegram_chat_id" in input) {
    const normalized =
      input.telegram_chat_id == null
        ? null
        : normalizeTelegramId(input.telegram_chat_id)
    out.telegram_chat_id_enc = encryptStringNullable(normalized, {
      table: "households",
      column: "telegram_chat_id_enc",
    })
    out.telegram_chat_id_hash = deterministicHashNullable(normalized, {
      table: "households",
      column: "telegram_chat_id_hash",
    })
  }

  return out
}
