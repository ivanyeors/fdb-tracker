import { encryptStringNullable } from "@/lib/crypto/cipher"
import {
  deterministicHash,
  deterministicHashNullable,
  normalizeTelegramId,
  normalizeTelegramUsername,
} from "@/lib/crypto/hash"

export interface LinkedTelegramAccountPiiInput {
  telegram_user_id?: string | null
  telegram_username?: string | null
  telegram_chat_id?: string | null
}

export function encodeLinkedTelegramAccountPiiPatch(
  input: LinkedTelegramAccountPiiInput,
): {
  telegram_user_id_enc?: string | null
  telegram_user_id_hash?: string | null
  telegram_username_enc?: string | null
  telegram_username_hash?: string | null
  telegram_chat_id_enc?: string | null
  telegram_chat_id_hash?: string | null
} {
  const out: Record<string, string | null> = {}

  if ("telegram_user_id" in input) {
    const normalized =
      input.telegram_user_id == null
        ? null
        : normalizeTelegramId(input.telegram_user_id)
    out.telegram_user_id_enc = encryptStringNullable(normalized, {
      table: "linked_telegram_accounts",
      column: "telegram_user_id_enc",
    })
    out.telegram_user_id_hash = deterministicHashNullable(normalized, {
      table: "linked_telegram_accounts",
      column: "telegram_user_id_hash",
    })
  }

  if ("telegram_username" in input) {
    const normalized =
      input.telegram_username == null || input.telegram_username === ""
        ? null
        : normalizeTelegramUsername(input.telegram_username)
    out.telegram_username_enc = encryptStringNullable(normalized, {
      table: "linked_telegram_accounts",
      column: "telegram_username_enc",
    })
    out.telegram_username_hash = deterministicHashNullable(normalized, {
      table: "linked_telegram_accounts",
      column: "telegram_username_hash",
    })
  }

  if ("telegram_chat_id" in input) {
    const normalized =
      input.telegram_chat_id == null
        ? null
        : normalizeTelegramId(input.telegram_chat_id)
    out.telegram_chat_id_enc = encryptStringNullable(normalized, {
      table: "linked_telegram_accounts",
      column: "telegram_chat_id_enc",
    })
    out.telegram_chat_id_hash = deterministicHashNullable(normalized, {
      table: "linked_telegram_accounts",
      column: "telegram_chat_id_hash",
    })
  }

  return out
}

/**
 * The unique constraint that previously enforced
 * `(link_api_key_id, telegram_user_id)` now lives on `telegram_user_id_hash`.
 * Use this string as the `onConflict` argument in upserts.
 */
export const LINKED_TELEGRAM_ACCOUNTS_USER_HASH_CONFLICT =
  "link_api_key_id,telegram_user_id_hash"

export function hashTelegramUserIdForLinkedAccounts(
  telegramUserId: string,
): string {
  return deterministicHash(normalizeTelegramId(telegramUserId), {
    table: "linked_telegram_accounts",
    column: "telegram_user_id_hash",
  })
}

export function hashTelegramUsernameForLinkedAccounts(
  username: string,
): string {
  return deterministicHash(normalizeTelegramUsername(username), {
    table: "linked_telegram_accounts",
    column: "telegram_username_hash",
  })
}
