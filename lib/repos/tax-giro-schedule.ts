import {
  decryptJsonNullable,
  decryptNumber,
  encryptJsonNullable,
  encryptNumberNullable,
  type EncryptedString,
} from "@/lib/crypto/cipher"

export interface TaxGiroSchedulePiiInput {
  schedule?: unknown
  total_payable?: number | null
  outstanding_balance?: number | null
}

type TaxGiroSchedulePiiPatch = {
  schedule_enc?: EncryptedString | null
  total_payable_enc?: EncryptedString | null
  outstanding_balance_enc?: EncryptedString | null
}

export function encodeTaxGiroSchedulePiiPatch(
  input: TaxGiroSchedulePiiInput,
): TaxGiroSchedulePiiPatch {
  const out: TaxGiroSchedulePiiPatch = {}
  if ("schedule" in input) {
    out.schedule_enc = encryptJsonNullable(input.schedule ?? null, {
      table: "tax_giro_schedule",
      column: "schedule_enc",
    })
  }
  if ("total_payable" in input) {
    out.total_payable_enc = encryptNumberNullable(
      input.total_payable ?? null,
      { table: "tax_giro_schedule", column: "total_payable_enc" },
    )
  }
  if ("outstanding_balance" in input) {
    out.outstanding_balance_enc = encryptNumberNullable(
      input.outstanding_balance ?? null,
      { table: "tax_giro_schedule", column: "outstanding_balance_enc" },
    )
  }
  return out
}

// ─── Decoder ─────────────────────────────────────────────────────────────

export interface TaxGiroSchedulePiiRow {
  schedule?: unknown
  schedule_enc?: string | null
  total_payable?: number | null
  total_payable_enc?: string | null
  outstanding_balance?: number | null
  outstanding_balance_enc?: string | null
}

export interface TaxGiroSchedulePiiDecoded {
  schedule: unknown
  total_payable: number | null
  outstanding_balance: number | null
}

export function decodeTaxGiroSchedulePii(
  row: TaxGiroSchedulePiiRow,
): TaxGiroSchedulePiiDecoded {
  return {
    schedule: tryJson(row.schedule_enc, row.schedule, "schedule_enc"),
    total_payable: tryNum(
      row.total_payable_enc,
      row.total_payable,
      "total_payable_enc",
    ),
    outstanding_balance: tryNum(
      row.outstanding_balance_enc,
      row.outstanding_balance,
      "outstanding_balance_enc",
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
      return decryptNumber(enc, { table: "tax_giro_schedule", column })
    } catch (err) {
      console.error(
        `[tax_giro_schedule.decodeTaxGiroSchedulePii] decrypt failed for ${column}, falling back:`,
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
      return decryptJsonNullable(enc, { table: "tax_giro_schedule", column })
    } catch (err) {
      console.error(
        `[tax_giro_schedule.decodeTaxGiroSchedulePii] decrypt failed for ${column}, falling back:`,
        err,
      )
    }
  }
  return plain ?? null
}

export const TAX_GIRO_SCHEDULE_PII_SELECT =
  "schedule_enc, total_payable_enc, outstanding_balance_enc"
