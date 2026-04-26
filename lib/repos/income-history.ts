import {
  decryptNumber,
  encryptNumberNullable,
  type EncryptedString,
} from "@/lib/crypto/cipher"

export interface IncomeHistoryPiiInput {
  monthly_salary?: number | null
}

type IncomeHistoryPiiPatch = {
  monthly_salary_enc?: EncryptedString | null
}

export function encodeIncomeHistoryPiiPatch(
  input: IncomeHistoryPiiInput,
): IncomeHistoryPiiPatch {
  const out: IncomeHistoryPiiPatch = {}
  if ("monthly_salary" in input) {
    out.monthly_salary_enc = encryptNumberNullable(
      input.monthly_salary ?? null,
      { table: "income_history", column: "monthly_salary_enc" },
    )
  }
  return out
}

// ─── Decoder ─────────────────────────────────────────────────────────────

export interface IncomeHistoryPiiRow {
  monthly_salary?: number | null
  monthly_salary_enc?: string | null
}

export interface IncomeHistoryPiiDecoded {
  monthly_salary: number | null
}

export function decodeIncomeHistoryPii(
  row: IncomeHistoryPiiRow,
): IncomeHistoryPiiDecoded {
  return {
    monthly_salary: tryNum(
      row.monthly_salary_enc,
      row.monthly_salary,
      "monthly_salary_enc",
    ),
  }
}

function tryNum(
  enc: string | null | undefined,
  plain: number | null | undefined,
  column: string,
): number | null {
  if (enc) {
    try {
      return decryptNumber(enc, { table: "income_history", column })
    } catch (err) {
      console.error(
        `[income_history.decodeIncomeHistoryPii] decrypt failed for ${column}, falling back:`,
        err,
      )
    }
  }
  return plain ?? null
}

export const INCOME_HISTORY_PII_SELECT = "monthly_salary_enc"
