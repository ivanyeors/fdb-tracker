import {
  decryptNumber,
  encryptNumberNullable,
  type EncryptedString,
} from "@/lib/crypto/cipher"

export interface TaxReliefAutoPiiInput {
  amount?: number | null
}

type TaxReliefAutoPiiPatch = {
  amount_enc?: EncryptedString | null
}

export function encodeTaxReliefAutoPiiPatch(
  input: TaxReliefAutoPiiInput,
): TaxReliefAutoPiiPatch {
  const out: TaxReliefAutoPiiPatch = {}
  if ("amount" in input) {
    out.amount_enc = encryptNumberNullable(input.amount ?? null, {
      table: "tax_relief_auto",
      column: "amount_enc",
    })
  }
  return out
}

// ─── Decoder ─────────────────────────────────────────────────────────────

export interface TaxReliefAutoPiiRow {
  amount?: number | null
  amount_enc?: string | null
}

export interface TaxReliefAutoPiiDecoded {
  amount: number | null
}

export function decodeTaxReliefAutoPii(
  row: TaxReliefAutoPiiRow,
): TaxReliefAutoPiiDecoded {
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
      return decryptNumber(enc, { table: "tax_relief_auto", column })
    } catch (err) {
      console.error(
        `[tax_relief_auto.decodeTaxReliefAutoPii] decrypt failed for ${column}, falling back:`,
        err,
      )
    }
  }
  return plain ?? null
}

export const TAX_RELIEF_AUTO_PII_SELECT = "amount, amount_enc"
