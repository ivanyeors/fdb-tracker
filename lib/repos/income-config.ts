import {
  decryptNumber,
  encryptNumberNullable,
  type EncryptedString,
} from "@/lib/crypto/cipher"

export interface IncomeConfigPiiInput {
  annual_salary?: number | null
  bonus_estimate?: number | null
}

type IncomeConfigPiiPatch = {
  annual_salary_enc?: EncryptedString | null
  bonus_estimate_enc?: EncryptedString | null
}

export function encodeIncomeConfigPiiPatch(
  input: IncomeConfigPiiInput,
): IncomeConfigPiiPatch {
  const out: IncomeConfigPiiPatch = {}
  if ("annual_salary" in input) {
    out.annual_salary_enc = encryptNumberNullable(input.annual_salary ?? null, {
      table: "income_config",
      column: "annual_salary_enc",
    })
  }
  if ("bonus_estimate" in input) {
    out.bonus_estimate_enc = encryptNumberNullable(
      input.bonus_estimate ?? null,
      { table: "income_config", column: "bonus_estimate_enc" },
    )
  }
  return out
}

// ─── Decoder ─────────────────────────────────────────────────────────────

export interface IncomeConfigPiiRow {
  annual_salary?: number | null
  annual_salary_enc?: string | null
  bonus_estimate?: number | null
  bonus_estimate_enc?: string | null
}

export interface IncomeConfigPiiDecoded {
  annual_salary: number | null
  bonus_estimate: number | null
}

export function decodeIncomeConfigPii(
  row: IncomeConfigPiiRow,
): IncomeConfigPiiDecoded {
  return {
    annual_salary: tryNum(
      row.annual_salary_enc,
      row.annual_salary,
      "annual_salary_enc",
    ),
    bonus_estimate: tryNum(
      row.bonus_estimate_enc,
      row.bonus_estimate,
      "bonus_estimate_enc",
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
      return decryptNumber(enc, { table: "income_config", column })
    } catch (err) {
      console.error(
        `[income_config.decodeIncomeConfigPii] decrypt failed for ${column}, falling back:`,
        err,
      )
    }
  }
  return plain ?? null
}

export const INCOME_CONFIG_PII_SELECT =
  "annual_salary_enc, bonus_estimate_enc"
