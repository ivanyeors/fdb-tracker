import {
  decryptJsonNullable,
  decryptNumber,
  encryptJsonNullable,
  encryptNumberNullable,
  type EncryptedString,
} from "@/lib/crypto/cipher"

export interface TaxNoaDataPiiInput {
  employment_income?: number | null
  chargeable_income?: number | null
  total_deductions?: number | null
  donations_deduction?: number | null
  reliefs_total?: number | null
  tax_payable?: number | null
  reliefs_json?: unknown
  bracket_summary_json?: unknown
}

type TaxNoaDataPiiPatch = {
  employment_income_enc?: EncryptedString | null
  chargeable_income_enc?: EncryptedString | null
  total_deductions_enc?: EncryptedString | null
  donations_deduction_enc?: EncryptedString | null
  reliefs_total_enc?: EncryptedString | null
  tax_payable_enc?: EncryptedString | null
  reliefs_json_enc?: EncryptedString | null
  bracket_summary_json_enc?: EncryptedString | null
}

export function encodeTaxNoaDataPiiPatch(
  input: TaxNoaDataPiiInput,
): TaxNoaDataPiiPatch {
  const out: TaxNoaDataPiiPatch = {}
  for (const num of [
    "employment_income",
    "chargeable_income",
    "total_deductions",
    "donations_deduction",
    "reliefs_total",
    "tax_payable",
  ] as const) {
    if (num in input) {
      const encKey = `${num}_enc` as const
      out[encKey] = encryptNumberNullable(input[num] ?? null, {
        table: "tax_noa_data",
        column: encKey,
      })
    }
  }
  if ("reliefs_json" in input) {
    out.reliefs_json_enc = encryptJsonNullable(input.reliefs_json ?? null, {
      table: "tax_noa_data",
      column: "reliefs_json_enc",
    })
  }
  if ("bracket_summary_json" in input) {
    out.bracket_summary_json_enc = encryptJsonNullable(
      input.bracket_summary_json ?? null,
      { table: "tax_noa_data", column: "bracket_summary_json_enc" },
    )
  }
  return out
}

// ─── Decoder ─────────────────────────────────────────────────────────────

export interface TaxNoaDataPiiRow {
  employment_income?: number | null
  employment_income_enc?: string | null
  chargeable_income?: number | null
  chargeable_income_enc?: string | null
  total_deductions?: number | null
  total_deductions_enc?: string | null
  donations_deduction?: number | null
  donations_deduction_enc?: string | null
  reliefs_total?: number | null
  reliefs_total_enc?: string | null
  tax_payable?: number | null
  tax_payable_enc?: string | null
  reliefs_json?: unknown
  reliefs_json_enc?: string | null
  bracket_summary_json?: unknown
  bracket_summary_json_enc?: string | null
}

export interface TaxNoaDataPiiDecoded {
  employment_income: number | null
  chargeable_income: number | null
  total_deductions: number | null
  donations_deduction: number | null
  reliefs_total: number | null
  tax_payable: number | null
  reliefs_json: unknown
  bracket_summary_json: unknown
}

export function decodeTaxNoaDataPii(
  row: TaxNoaDataPiiRow,
): TaxNoaDataPiiDecoded {
  return {
    employment_income: tryNum(
      row.employment_income_enc,
      row.employment_income,
      "employment_income_enc",
    ),
    chargeable_income: tryNum(
      row.chargeable_income_enc,
      row.chargeable_income,
      "chargeable_income_enc",
    ),
    total_deductions: tryNum(
      row.total_deductions_enc,
      row.total_deductions,
      "total_deductions_enc",
    ),
    donations_deduction: tryNum(
      row.donations_deduction_enc,
      row.donations_deduction,
      "donations_deduction_enc",
    ),
    reliefs_total: tryNum(
      row.reliefs_total_enc,
      row.reliefs_total,
      "reliefs_total_enc",
    ),
    tax_payable: tryNum(
      row.tax_payable_enc,
      row.tax_payable,
      "tax_payable_enc",
    ),
    reliefs_json: tryJson(
      row.reliefs_json_enc,
      row.reliefs_json,
      "reliefs_json_enc",
    ),
    bracket_summary_json: tryJson(
      row.bracket_summary_json_enc,
      row.bracket_summary_json,
      "bracket_summary_json_enc",
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
      return decryptNumber(enc, { table: "tax_noa_data", column })
    } catch (err) {
      console.error(
        `[tax_noa_data.decodeTaxNoaDataPii] decrypt failed for ${column}, falling back:`,
        err,
      )
    }
  }
  return plain ?? null
}

function tryJson(
  enc: string | null | undefined,
  plain: unknown,
  column: string,
): unknown {
  if (enc) {
    try {
      return decryptJsonNullable(enc, { table: "tax_noa_data", column })
    } catch (err) {
      console.error(
        `[tax_noa_data.decodeTaxNoaDataPii] decrypt failed for ${column}, falling back:`,
        err,
      )
    }
  }
  return plain ?? null
}

export const TAX_NOA_DATA_PII_SELECT =
  "employment_income_enc, chargeable_income_enc, total_deductions_enc, donations_deduction_enc, reliefs_total_enc, tax_payable_enc, reliefs_json_enc, bracket_summary_json_enc"
