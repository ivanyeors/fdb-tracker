import {
  decryptNumber,
  decryptString,
  encryptNumberNullable,
  encryptStringNullable,
} from "@/lib/crypto/cipher"

export interface LoanPiiInput {
  lender?: string | null
  principal?: number | null
}

export function encodeLoanPiiPatch(input: LoanPiiInput): {
  lender_enc?: string | null
  principal_enc?: string | null
} {
  const out: Record<string, string | null> = {}

  if ("lender" in input) {
    out.lender_enc = encryptStringNullable(input.lender ?? null, {
      table: "loans",
      column: "lender_enc",
    })
  }

  if ("principal" in input) {
    out.principal_enc = encryptNumberNullable(input.principal ?? null, {
      table: "loans",
      column: "principal_enc",
    })
  }

  return out
}

// ─── Decoder ─────────────────────────────────────────────────────────────

export interface LoanPiiRow {
  lender?: string | null
  lender_enc?: string | null
  principal?: number | null
  principal_enc?: string | null
}

export interface LoanPiiDecoded {
  lender: string | null
  principal: number | null
}

export function decodeLoanPii(row: LoanPiiRow): LoanPiiDecoded {
  return {
    lender: tryStr(row.lender_enc, row.lender, "lender_enc"),
    principal: tryNum(row.principal_enc, row.principal, "principal_enc"),
  }
}

function tryStr(
  enc: string | null | undefined,
  plain: string | null | undefined,
  column: string,
): string | null {
  if (enc) {
    try {
      return decryptString(enc, { table: "loans", column })
    } catch (err) {
      console.error(
        `[loans.decodeLoanPii] decrypt failed for ${column}, falling back:`,
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
      return decryptNumber(enc, { table: "loans", column })
    } catch (err) {
      console.error(
        `[loans.decodeLoanPii] decrypt failed for ${column}, falling back:`,
        err,
      )
    }
  }
  return plain ?? null
}

export const LOAN_PII_SELECT = "lender, lender_enc, principal, principal_enc"
