import {
  decryptNumber,
  encryptNumberNullable,
  type EncryptedString,
} from "@/lib/crypto/cipher"

export interface InsurancePoliciesPiiInput {
  premium_amount?: number | null
  coverage_amount?: number | null
}

type InsurancePoliciesPiiPatch = {
  premium_amount_enc?: EncryptedString | null
  coverage_amount_enc?: EncryptedString | null
}

export function encodeInsurancePoliciesPiiPatch(
  input: InsurancePoliciesPiiInput,
): InsurancePoliciesPiiPatch {
  const out: InsurancePoliciesPiiPatch = {}
  if ("premium_amount" in input) {
    out.premium_amount_enc = encryptNumberNullable(
      input.premium_amount ?? null,
      { table: "insurance_policies", column: "premium_amount_enc" },
    )
  }
  if ("coverage_amount" in input) {
    out.coverage_amount_enc = encryptNumberNullable(
      input.coverage_amount ?? null,
      { table: "insurance_policies", column: "coverage_amount_enc" },
    )
  }
  return out
}

// ─── Decoder ─────────────────────────────────────────────────────────────

export interface InsurancePoliciesPiiRow {
  premium_amount?: number | null
  premium_amount_enc?: string | null
  coverage_amount?: number | null
  coverage_amount_enc?: string | null
}

export interface InsurancePoliciesPiiDecoded {
  premium_amount: number | null
  coverage_amount: number | null
}

export function decodeInsurancePoliciesPii(
  row: InsurancePoliciesPiiRow,
): InsurancePoliciesPiiDecoded {
  return {
    premium_amount: tryNum(
      row.premium_amount_enc,
      row.premium_amount,
      "premium_amount_enc",
    ),
    coverage_amount: tryNum(
      row.coverage_amount_enc,
      row.coverage_amount,
      "coverage_amount_enc",
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
      return decryptNumber(enc, { table: "insurance_policies", column })
    } catch (err) {
      console.error(
        `[insurance_policies.decodeInsurancePoliciesPii] decrypt failed for ${column}, falling back:`,
        err,
      )
    }
  }
  return plain ?? null
}

export const INSURANCE_POLICIES_PII_SELECT =
  "premium_amount, premium_amount_enc, coverage_amount, coverage_amount_enc"
