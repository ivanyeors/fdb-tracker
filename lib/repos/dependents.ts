import {
  decryptNumber,
  decryptString,
  encryptNumberNullable,
  encryptStringNullable,
  type EncryptedString,
} from "@/lib/crypto/cipher"

export interface DependentPiiInput {
  name?: string | null
  birth_year?: number | null
  annual_income?: number | null
}

type DependentPiiPatch = {
  name_enc?: EncryptedString | null
  birth_year_enc?: EncryptedString | null
  annual_income_enc?: EncryptedString | null
}

export function encodeDependentPiiPatch(
  input: DependentPiiInput,
): DependentPiiPatch {
  const out: DependentPiiPatch = {}

  if ("name" in input) {
    out.name_enc = encryptStringNullable(input.name ?? null, {
      table: "dependents",
      column: "name_enc",
    })
  }

  if ("birth_year" in input) {
    out.birth_year_enc = encryptNumberNullable(input.birth_year ?? null, {
      table: "dependents",
      column: "birth_year_enc",
    })
  }

  if ("annual_income" in input) {
    out.annual_income_enc = encryptNumberNullable(input.annual_income ?? null, {
      table: "dependents",
      column: "annual_income_enc",
    })
  }

  return out
}

// ─── Decoder ─────────────────────────────────────────────────────────────

export interface DependentPiiRow {
  name?: string | null
  name_enc?: string | null
  birth_year?: number | null
  birth_year_enc?: string | null
  annual_income?: number | null
  annual_income_enc?: string | null
}

export interface DependentPiiDecoded {
  name: string | null
  birth_year: number | null
  annual_income: number | null
}

export function decodeDependentPii(row: DependentPiiRow): DependentPiiDecoded {
  return {
    name: tryStr(row.name_enc, row.name, "name_enc"),
    birth_year: tryNum(row.birth_year_enc, row.birth_year, "birth_year_enc"),
    annual_income: tryNum(
      row.annual_income_enc,
      row.annual_income,
      "annual_income_enc",
    ),
  }
}

function tryStr(
  enc: string | null | undefined,
  plain: string | null | undefined,
  column: string,
): string | null {
  if (enc) {
    try {
      return decryptString(enc, { table: "dependents", column })
    } catch (err) {
      console.error(
        `[dependents.decodeDependentPii] decrypt failed for ${column}, falling back:`,
        err,
      )
    }
  }
  return plain ?? null
}

function tryNum(
  enc: string | null | undefined,
  plain: number | null | undefined,
  column: string,
): number | null {
  if (enc) {
    try {
      return decryptNumber(enc, { table: "dependents", column })
    } catch (err) {
      console.error(
        `[dependents.decodeDependentPii] decrypt failed for ${column}, falling back:`,
        err,
      )
    }
  }
  return plain ?? null
}

export const DEPENDENT_PII_SELECT =
  "name, name_enc, birth_year, birth_year_enc, annual_income, annual_income_enc"
