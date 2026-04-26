import {
  decryptNumber,
  encryptNumberNullable,
  type EncryptedString,
} from "@/lib/crypto/cipher"

export interface CpfBalancesPiiInput {
  oa?: number | null
  sa?: number | null
  ma?: number | null
}

type CpfBalancesPiiPatch = {
  oa_enc?: EncryptedString | null
  sa_enc?: EncryptedString | null
  ma_enc?: EncryptedString | null
}

export function encodeCpfBalancesPiiPatch(
  input: CpfBalancesPiiInput,
): CpfBalancesPiiPatch {
  const out: CpfBalancesPiiPatch = {}
  if ("oa" in input) {
    out.oa_enc = encryptNumberNullable(input.oa ?? null, {
      table: "cpf_balances",
      column: "oa_enc",
    })
  }
  if ("sa" in input) {
    out.sa_enc = encryptNumberNullable(input.sa ?? null, {
      table: "cpf_balances",
      column: "sa_enc",
    })
  }
  if ("ma" in input) {
    out.ma_enc = encryptNumberNullable(input.ma ?? null, {
      table: "cpf_balances",
      column: "ma_enc",
    })
  }
  return out
}

// ─── Decoder ─────────────────────────────────────────────────────────────

export interface CpfBalancesPiiRow {
  oa?: number | null
  oa_enc?: string | null
  sa?: number | null
  sa_enc?: string | null
  ma?: number | null
  ma_enc?: string | null
}

export interface CpfBalancesPiiDecoded {
  oa: number | null
  sa: number | null
  ma: number | null
}

export function decodeCpfBalancesPii(
  row: CpfBalancesPiiRow,
): CpfBalancesPiiDecoded {
  return {
    oa: tryNum(row.oa_enc, row.oa, "oa_enc"),
    sa: tryNum(row.sa_enc, row.sa, "sa_enc"),
    ma: tryNum(row.ma_enc, row.ma, "ma_enc"),
  }
}

function tryNum(
  enc: string | null | undefined,
  plain: number | null | undefined,
  column: string,
): number | null {
  if (enc) {
    try {
      return decryptNumber(enc, { table: "cpf_balances", column })
    } catch (err) {
      console.error(
        `[cpf_balances.decodeCpfBalancesPii] decrypt failed for ${column}, falling back:`,
        err,
      )
    }
  }
  return plain ?? null
}

export const CPF_BALANCES_PII_SELECT = "oa_enc, sa_enc, ma_enc"
