import {
  encryptStringNullable,
  type EncryptedString,
} from "@/lib/crypto/cipher"
import {
  deterministicHash,
  deterministicHashNullable,
  normalizeTelegramId,
  normalizeTelegramUsername,
} from "@/lib/crypto/hash"

export interface SignupCodePiiInput {
  telegram_username?: string | null
  used_by_telegram_user_id?: string | null
}

type SignupCodePiiPatch = {
  telegram_username_enc?: EncryptedString | null
  telegram_username_hash?: string | null
  used_by_telegram_user_id_enc?: EncryptedString | null
  used_by_telegram_user_id_hash?: string | null
}

export function encodeSignupCodePiiPatch(
  input: SignupCodePiiInput,
): SignupCodePiiPatch {
  const out: SignupCodePiiPatch = {}

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

export function hashSignupCodeTelegramUsername(username: string): string {
  return deterministicHash(normalizeTelegramUsername(username), {
    table: "signup_codes",
    column: "telegram_username_hash",
  })
}
