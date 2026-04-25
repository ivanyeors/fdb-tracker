import {
  encryptNumberNullable,
  encryptStringNullable,
} from "@/lib/crypto/cipher"
import {
  deterministicHashNullable,
  normalizeTelegramId,
  normalizeTelegramUsername,
} from "@/lib/crypto/hash"

export interface ProfilePiiInput {
  name?: string | null
  birth_year?: number | null
  telegram_user_id?: string | null
  telegram_username?: string | null
  telegram_chat_id?: string | null
}

/**
 * Encodes the encrypted + hash variants for any subset of profile PII fields
 * present in `input`. Caller spreads the result into their plaintext
 * INSERT/UPDATE patch — only the keys provided are encoded so partial UPDATEs
 * don't accidentally null out untouched columns.
 *
 * Username/IDs are normalized (lowercase + @-strip / toString-trim) before
 * both encryption AND hashing so lookups remain case-insensitive.
 */
export function encodeProfilePiiPatch(input: ProfilePiiInput): {
  name_enc?: string | null
  name_hash?: string | null
  birth_year_enc?: string | null
  telegram_user_id_enc?: string | null
  telegram_user_id_hash?: string | null
  telegram_username_enc?: string | null
  telegram_username_hash?: string | null
  telegram_chat_id_enc?: string | null
  telegram_chat_id_hash?: string | null
} {
  const out: Record<string, string | null> = {}

  if ("name" in input) {
    out.name_enc = encryptStringNullable(input.name ?? null, {
      table: "profiles",
      column: "name_enc",
    })
    out.name_hash = deterministicHashNullable(input.name ?? null, {
      table: "profiles",
      column: "name_hash",
    })
  }

  if ("birth_year" in input) {
    out.birth_year_enc = encryptNumberNullable(input.birth_year ?? null, {
      table: "profiles",
      column: "birth_year_enc",
    })
  }

  if ("telegram_user_id" in input) {
    const normalized =
      input.telegram_user_id == null
        ? null
        : normalizeTelegramId(input.telegram_user_id)
    out.telegram_user_id_enc = encryptStringNullable(normalized, {
      table: "profiles",
      column: "telegram_user_id_enc",
    })
    out.telegram_user_id_hash = deterministicHashNullable(normalized, {
      table: "profiles",
      column: "telegram_user_id_hash",
    })
  }

  if ("telegram_username" in input) {
    const normalized =
      input.telegram_username == null || input.telegram_username === ""
        ? null
        : normalizeTelegramUsername(input.telegram_username)
    out.telegram_username_enc = encryptStringNullable(normalized, {
      table: "profiles",
      column: "telegram_username_enc",
    })
    out.telegram_username_hash = deterministicHashNullable(normalized, {
      table: "profiles",
      column: "telegram_username_hash",
    })
  }

  if ("telegram_chat_id" in input) {
    const normalized =
      input.telegram_chat_id == null
        ? null
        : normalizeTelegramId(input.telegram_chat_id)
    out.telegram_chat_id_enc = encryptStringNullable(normalized, {
      table: "profiles",
      column: "telegram_chat_id_enc",
    })
    out.telegram_chat_id_hash = deterministicHashNullable(normalized, {
      table: "profiles",
      column: "telegram_chat_id_hash",
    })
  }

  return out
}
