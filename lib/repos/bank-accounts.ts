import {
  decryptString,
  encryptStringNullable,
  type EncryptedString,
} from "@/lib/crypto/cipher"
import {
  deterministicHash,
  deterministicHashNullable,
  normalizeAccountNumber,
} from "@/lib/crypto/hash"

export interface BankAccountPiiInput {
  account_number?: string | null
}

/**
 * Returns the last 4 digits of a normalized account number, or null if there
 * are fewer than 4 digits.
 */
export function lastFourOfAccountNumber(
  accountNumber: string | null | undefined,
): string | null {
  if (!accountNumber) return null
  const normalized = normalizeAccountNumber(accountNumber)
  if (normalized.length < 4) return null
  return normalized.slice(-4)
}

/**
 * Encodes the encrypted, hashed, and last-4 variants for a bank account.
 * - account_number_enc preserves the original (possibly formatted) string
 * - account_number_hash uses the normalized digits-only form so that
 *   "1234-5678 9012" and "123456789012" hash to the same value
 * - account_number_last4 is the last 4 digits, plaintext, used for masked
 *   display and for the existing PDF-import last-4 matching path
 */
export function encodeBankAccountPiiPatch(input: BankAccountPiiInput): {
  account_number_enc?: EncryptedString | null
  account_number_hash?: string | null
  account_number_last4?: string | null
} {
  const out: {
    account_number_enc?: EncryptedString | null
    account_number_hash?: string | null
    account_number_last4?: string | null
  } = {}

  if ("account_number" in input) {
    const raw = input.account_number ?? null
    const normalized = raw == null ? null : normalizeAccountNumber(raw)
    out.account_number_enc = encryptStringNullable(raw, {
      table: "bank_accounts",
      column: "account_number_enc",
    })
    out.account_number_hash = deterministicHashNullable(normalized, {
      table: "bank_accounts",
      column: "account_number_hash",
    })
    out.account_number_last4 = lastFourOfAccountNumber(raw)
  }

  return out
}

// ─── Decoder ─────────────────────────────────────────────────────────────

export interface BankAccountPiiRow {
  account_number?: string | null
  account_number_enc?: string | null
  account_number_last4?: string | null
}

export interface BankAccountPiiDecoded {
  account_number: string | null
  account_number_last4: string | null
}

/**
 * Decode bank account PII fields. Prefers ciphertext; falls back to
 * plaintext on null OR decryption error (logged). Used when callers need
 * the full account number (e.g., the edit-account screen). For list views,
 * callers should display only `account_number_last4` (e.g., "****5678").
 */
export function decodeBankAccountPii(
  row: BankAccountPiiRow,
): BankAccountPiiDecoded {
  let accountNumber: string | null = null
  if (row.account_number_enc) {
    try {
      accountNumber = decryptString(row.account_number_enc, {
        table: "bank_accounts",
        column: "account_number_enc",
      })
    } catch (err) {
      console.error(
        "[bank-accounts.decodeBankAccountPii] decrypt failed, falling back to plaintext:",
        err,
      )
      accountNumber = row.account_number ?? null
    }
  } else {
    accountNumber = row.account_number ?? null
  }
  const last4 =
    row.account_number_last4 ?? lastFourOfAccountNumber(accountNumber)
  return { account_number: accountNumber, account_number_last4: last4 }
}

// ─── Lookup hash (for callers building queries) ──────────────────────────

export function hashBankAccountNumber(accountNumber: string): string {
  return deterministicHash(normalizeAccountNumber(accountNumber), {
    table: "bank_accounts",
    column: "account_number_hash",
  })
}

export const BANK_ACCOUNT_PII_SELECT =
  "account_number, account_number_enc, account_number_last4"
