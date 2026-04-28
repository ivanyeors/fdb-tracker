import {
  decryptNumber,
  encryptNumberNullable,
  type EncryptedString,
} from "@/lib/crypto/cipher"
import { deterministicHashNullable } from "@/lib/crypto/hash"

export interface BankTransactionPiiInput {
  amount?: number | null
  balance?: number | null
}

type BankTransactionPiiPatch = {
  amount_enc?: EncryptedString | null
  amount_hash?: string | null
  balance_enc?: EncryptedString | null
}

/**
 * Encodes the encrypted variants for bank_transactions amount/balance.
 *
 * `amount_hash` mirrors the legacy UNIQUE(profile_id, month, txn_date,
 * description, amount, statement_type) constraint from migration 043 so
 * that dedup keeps working once the plaintext `amount` column is dropped.
 * The hash is over the canonical decimal-string form so that 1000 and
 * 1000.00 collide (which matches NUMERIC equality at the DB level).
 */
export function encodeBankTransactionPiiPatch(
  input: BankTransactionPiiInput,
): BankTransactionPiiPatch {
  const out: BankTransactionPiiPatch = {}

  if ("amount" in input) {
    const amount = input.amount ?? null
    out.amount_enc = encryptNumberNullable(amount, {
      table: "bank_transactions",
      column: "amount_enc",
    })
    out.amount_hash = deterministicHashNullable(
      amount == null ? null : canonicalAmount(amount),
      { table: "bank_transactions", column: "amount_hash" },
    )
  }

  if ("balance" in input) {
    out.balance_enc = encryptNumberNullable(input.balance ?? null, {
      table: "bank_transactions",
      column: "balance_enc",
    })
  }

  return out
}

// ─── Decoder ─────────────────────────────────────────────────────────────

export interface BankTransactionPiiRow {
  amount?: number | null
  amount_enc?: string | null
  balance?: number | null
  balance_enc?: string | null
}

export interface BankTransactionPiiDecoded {
  amount: number | null
  balance: number | null
}

export function decodeBankTransactionPii(
  row: BankTransactionPiiRow,
): BankTransactionPiiDecoded {
  return {
    amount: tryNum(row.amount_enc, row.amount, "amount_enc"),
    balance: tryNum(row.balance_enc, row.balance, "balance_enc"),
  }
}

// ─── Lookup hash (callers building dedup queries) ────────────────────────

export function hashBankTransactionAmount(amount: number): string {
  return deterministicHashNullable(canonicalAmount(amount), {
    table: "bank_transactions",
    column: "amount_hash",
  })!
}

// Canonicalize to fixed 2-decimal string so that 1000 and 1000.00 collide
// (matching NUMERIC(14,2) equality semantics in Postgres).
function canonicalAmount(amount: number): string {
  if (!Number.isFinite(amount)) {
    throw new TypeError("canonicalAmount: non-finite input")
  }
  return amount.toFixed(2)
}

function tryNum(
  enc: string | null | undefined,
  plain: number | null | undefined,
  column: string,
): number | null {
  if (enc) {
    try {
      return decryptNumber(enc, { table: "bank_transactions", column })
    } catch (err) {
      console.error(
        `[bank_transactions.decodeBankTransactionPii] decrypt failed for ${column}, falling back:`,
        err,
      )
    }
  }
  return plain ?? null
}

export const BANK_TRANSACTION_PII_SELECT =
  "amount_enc, balance_enc"
