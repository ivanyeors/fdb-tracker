import { encryptStringNullable } from "@/lib/crypto/cipher"
import {
  deterministicHashNullable,
  normalizeTelegramId,
  normalizeTelegramUsername,
} from "@/lib/crypto/hash"

export interface SignupCodePiiInput {
  telegram_username?: string | null
  used_by_telegram_user_id?: string | null
}

export function encodeSignupCodePiiPatch(input: SignupCodePiiInput): {
  telegram_username_enc?: string | null
  telegram_username_hash?: string | null
  used_by_telegram_user_id_enc?: string | null
  used_by_telegram_user_id_hash?: string | null
} {
  const out: Record<string, string | null> = {}

  if ("telegram_username" in input) {
    const normalized =
      input.telegram_username == null || input.telegram_username === ""
        ? null
        : normalizeTelegramUsername(input.telegram_username)
    out.telegram_username_enc = encryptStringNullable(normalized, {
      table: "signup_codes",
      column: "telegram_username_enc",
    })
    out.telegram_username_hash = deterministicHashNullable(normalized, {
      table: "signup_codes",
      column: "telegram_username_hash",
    })
  }

  if ("used_by_telegram_user_id" in input) {
    const normalized =
      input.used_by_telegram_user_id == null
        ? null
        : normalizeTelegramId(input.used_by_telegram_user_id)
    out.used_by_telegram_user_id_enc = encryptStringNullable(normalized, {
      table: "signup_codes",
      column: "used_by_telegram_user_id_enc",
    })
    out.used_by_telegram_user_id_hash = deterministicHashNullable(normalized, {
      table: "signup_codes",
      column: "used_by_telegram_user_id_hash",
    })
  }

  return out
}
