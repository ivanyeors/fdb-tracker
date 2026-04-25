import {
  decryptNumber,
  decryptString,
  encryptNumberNullable,
  encryptStringNullable,
} from "@/lib/crypto/cipher"
import {
  deterministicHash,
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

// ─── Decoder ─────────────────────────────────────────────────────────────

export interface ProfilePiiRow {
  name?: string | null
  name_enc?: string | null
  birth_year?: number | null
  birth_year_enc?: string | null
  telegram_user_id?: string | null
  telegram_user_id_enc?: string | null
  telegram_username?: string | null
  telegram_username_enc?: string | null
  telegram_chat_id?: string | null
  telegram_chat_id_enc?: string | null
}

export interface ProfilePiiDecoded {
  name: string | null
  birth_year: number | null
  telegram_user_id: string | null
  telegram_username: string | null
  telegram_chat_id: string | null
}

/**
 * Decode profile PII fields from a row. Prefers ciphertext; falls back to
 * plaintext when the encrypted column is null OR decryption throws (logged).
 * Plaintext fallback exists only for the soak window — once 064 drops the
 * plaintext columns, only ciphertext is read.
 */
export function decodeProfilePii(row: ProfilePiiRow): ProfilePiiDecoded {
  return {
    name: tryDecryptString(row.name_enc, row.name, {
      table: "profiles",
      column: "name_enc",
    }),
    birth_year: tryDecryptNumber(row.birth_year_enc, row.birth_year, {
      table: "profiles",
      column: "birth_year_enc",
    }),
    telegram_user_id: tryDecryptString(
      row.telegram_user_id_enc,
      row.telegram_user_id,
      { table: "profiles", column: "telegram_user_id_enc" },
    ),
    telegram_username: tryDecryptString(
      row.telegram_username_enc,
      row.telegram_username,
      { table: "profiles", column: "telegram_username_enc" },
    ),
    telegram_chat_id: tryDecryptString(
      row.telegram_chat_id_enc,
      row.telegram_chat_id,
      { table: "profiles", column: "telegram_chat_id_enc" },
    ),
  }
}

function tryDecryptString(
  enc: string | null | undefined,
  plaintext: string | null | undefined,
  ctx: { table: string; column: string },
): string | null {
  if (enc) {
    try {
      return decryptString(enc, ctx)
    } catch (err) {
      console.error(
        `[profiles.decodeProfilePii] decrypt failed for ${ctx.column}, falling back to plaintext:`,
        err,
      )
    }
  }
  return plaintext ?? null
}

function tryDecryptNumber(
  enc: string | null | undefined,
  plaintext: number | null | undefined,
  ctx: { table: string; column: string },
): number | null {
  if (enc) {
    try {
      return decryptNumber(enc, ctx)
    } catch (err) {
      console.error(
        `[profiles.decodeProfilePii] decrypt failed for ${ctx.column}, falling back to plaintext:`,
        err,
      )
    }
  }
  return plaintext ?? null
}

// ─── Lookup hashes (for callers building queries) ────────────────────────

export function hashProfileTelegramUserId(telegramUserId: string): string {
  return deterministicHash(normalizeTelegramId(telegramUserId), {
    table: "profiles",
    column: "telegram_user_id_hash",
  })
}

export function hashProfileTelegramChatId(telegramChatId: string): string {
  return deterministicHash(normalizeTelegramId(telegramChatId), {
    table: "profiles",
    column: "telegram_chat_id_hash",
  })
}

export function hashProfileTelegramUsername(username: string): string {
  return deterministicHash(normalizeTelegramUsername(username), {
    table: "profiles",
    column: "telegram_username_hash",
  })
}

/** Columns to include in `.select(...)` whenever a caller needs decoded PII. */
export const PROFILE_PII_SELECT =
  "name, name_enc, birth_year, birth_year_enc, telegram_user_id, telegram_user_id_enc, telegram_username, telegram_username_enc, telegram_chat_id, telegram_chat_id_enc"
