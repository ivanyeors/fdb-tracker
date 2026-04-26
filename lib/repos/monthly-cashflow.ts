import {
  decryptNumber,
  encryptNumberNullable,
  type EncryptedString,
} from "@/lib/crypto/cipher"

export interface MonthlyCashflowPiiInput {
  inflow?: number | null
  outflow?: number | null
}

type MonthlyCashflowPiiPatch = {
  inflow_enc?: EncryptedString | null
  outflow_enc?: EncryptedString | null
}

export function encodeMonthlyCashflowPiiPatch(
  input: MonthlyCashflowPiiInput,
): MonthlyCashflowPiiPatch {
  const out: MonthlyCashflowPiiPatch = {}
  if ("inflow" in input) {
    out.inflow_enc = encryptNumberNullable(input.inflow ?? null, {
      table: "monthly_cashflow",
      column: "inflow_enc",
    })
  }
  if ("outflow" in input) {
    out.outflow_enc = encryptNumberNullable(input.outflow ?? null, {
      table: "monthly_cashflow",
      column: "outflow_enc",
    })
  }
  return out
}

// ─── Decoder ─────────────────────────────────────────────────────────────

export interface MonthlyCashflowPiiRow {
  inflow?: number | null
  inflow_enc?: string | null
  outflow?: number | null
  outflow_enc?: string | null
}

export interface MonthlyCashflowPiiDecoded {
  inflow: number | null
  outflow: number | null
}

export function decodeMonthlyCashflowPii(
  row: MonthlyCashflowPiiRow,
): MonthlyCashflowPiiDecoded {
  return {
    inflow: tryNum(row.inflow_enc, row.inflow, "inflow_enc"),
    outflow: tryNum(row.outflow_enc, row.outflow, "outflow_enc"),
  }
}

function tryNum(
  enc: string | null | undefined,
  plain: number | null | undefined,
  column: string,
): number | null {
  if (enc) {
    try {
      return decryptNumber(enc, { table: "monthly_cashflow", column })
    } catch (err) {
      console.error(
        `[monthly_cashflow.decodeMonthlyCashflowPii] decrypt failed for ${column}, falling back:`,
        err,
      )
    }
  }
  return plain ?? null
}

export const MONTHLY_CASHFLOW_PII_SELECT = "inflow_enc, outflow_enc"
