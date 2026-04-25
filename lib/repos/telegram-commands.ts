import {
  decryptString,
  encryptStringNullable,
  type EncryptedString,
} from "@/lib/crypto/cipher"

export interface TelegramCommandPiiInput {
  raw_message?: string | null
  args?: string | null
}

type TelegramCommandPiiPatch = {
  raw_message_enc?: EncryptedString | null
  args_enc?: EncryptedString | null
}

/**
 * Encodes encrypted variants for any subset of telegram_commands PII fields
 * present in `input`. There is no live writer for this table today; the
 * encoder exists so that any future writer (or backfill of existing rows)
 * has a typed entry point that produces the right ciphertext format.
 *
 * The 30-day purge cron at app/api/cron/purge/route.ts caps PII exposure
 * regardless of whether ciphertext is populated.
 */
export function encodeTelegramCommandPiiPatch(
  input: TelegramCommandPiiInput,
): TelegramCommandPiiPatch {
  const out: TelegramCommandPiiPatch = {}

  if ("raw_message" in input) {
    out.raw_message_enc = encryptStringNullable(input.raw_message ?? null, {
      table: "telegram_commands",
      column: "raw_message_enc",
    })
  }

  if ("args" in input) {
    out.args_enc = encryptStringNullable(input.args ?? null, {
      table: "telegram_commands",
      column: "args_enc",
    })
  }

  return out
}

// ─── Decoder ─────────────────────────────────────────────────────────────

export interface TelegramCommandPiiRow {
  raw_message?: string | null
  raw_message_enc?: string | null
  args?: string | null
  args_enc?: string | null
}

export interface TelegramCommandPiiDecoded {
  raw_message: string | null
  args: string | null
}

export function decodeTelegramCommandPii(
  row: TelegramCommandPiiRow,
): TelegramCommandPiiDecoded {
  return {
    raw_message: tryStr(row.raw_message_enc, row.raw_message, "raw_message_enc"),
    args: tryStr(row.args_enc, row.args, "args_enc"),
  }
}

function tryStr(
  enc: string | null | undefined,
  plain: string | null | undefined,
  column: string,
): string | null {
  if (enc) {
    try {
      return decryptString(enc, { table: "telegram_commands", column })
    } catch (err) {
      console.error(
        `[telegram_commands.decodeTelegramCommandPii] decrypt failed for ${column}, falling back:`,
        err,
      )
    }
  }
  return plain ?? null
}

export const TELEGRAM_COMMAND_PII_SELECT =
  "raw_message, raw_message_enc, args, args_enc"
