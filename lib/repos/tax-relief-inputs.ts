import {
  decryptNumber,
  encryptNumberNullable,
  type EncryptedString,
} from "@/lib/crypto/cipher"

export interface TaxReliefInputsPiiInput {
  amount?: number | null
}

type TaxReliefInputsPiiPatch = {
  amount_enc?: EncryptedString | null
}

export function encodeTaxReliefInputsPiiPatch(
  input: TaxReliefInputsPiiInput,
): TaxReliefInputsPiiPatch {
  const out: TaxReliefInputsPiiPatch = {}
  if ("amount" in input) {
    out.amount_enc = encryptNumberNullable(input.amount ?? null, {
      table: "tax_relief_inputs",
      column: "amount_enc",
    })
  }
  return out
}

// ─── Decoder ─────────────────────────────────────────────────────────────

export interface TaxReliefInputsPiiRow {
  amount?: number | null
  amount_enc?: string | null
}

export interface TaxReliefInputsPiiDecoded {
  amount: number | null
}

export function decodeTaxReliefInputsPii(
  row: TaxReliefInputsPiiRow,
): TaxReliefInputsPiiDecoded {
  return {
    amount: tryNum(row.amount_enc, row.amount, "amount_enc"),
  }
}

function tryNum(
  enc: string | null | undefined,
  plain: number | null | undefined,
  column: string,
): number | null {
  if (enc) {
    try {
      return decryptNumber(enc, { table: "tax_relief_inputs", column })
    } catch (err) {
      console.error(
        `[tax_relief_inputs.decodeTaxReliefInputsPii] decrypt failed for ${column}, falling back:`,
        err,
      )
    }
  }
  return plain ?? null
}

export const TAX_RELIEF_INPUTS_PII_SELECT = "amount_enc"
