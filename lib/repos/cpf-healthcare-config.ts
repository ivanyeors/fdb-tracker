import {
  decryptNumber,
  encryptNumberNullable,
  type EncryptedString,
} from "@/lib/crypto/cipher"

export interface CpfHealthcareConfigPiiInput {
  msl_annual_override?: number | null
  csl_annual?: number | null
  csl_supplement_annual?: number | null
  isp_annual?: number | null
}

type CpfHealthcareConfigPiiPatch = {
  msl_annual_override_enc?: EncryptedString | null
  csl_annual_enc?: EncryptedString | null
  csl_supplement_annual_enc?: EncryptedString | null
  isp_annual_enc?: EncryptedString | null
}

export function encodeCpfHealthcareConfigPiiPatch(
  input: CpfHealthcareConfigPiiInput,
): CpfHealthcareConfigPiiPatch {
  const out: CpfHealthcareConfigPiiPatch = {}
  if ("msl_annual_override" in input) {
    out.msl_annual_override_enc = encryptNumberNullable(
      input.msl_annual_override ?? null,
      { table: "cpf_healthcare_config", column: "msl_annual_override_enc" },
    )
  }
  if ("csl_annual" in input) {
    out.csl_annual_enc = encryptNumberNullable(input.csl_annual ?? null, {
      table: "cpf_healthcare_config",
      column: "csl_annual_enc",
    })
  }
  if ("csl_supplement_annual" in input) {
    out.csl_supplement_annual_enc = encryptNumberNullable(
      input.csl_supplement_annual ?? null,
      { table: "cpf_healthcare_config", column: "csl_supplement_annual_enc" },
    )
  }
  if ("isp_annual" in input) {
    out.isp_annual_enc = encryptNumberNullable(input.isp_annual ?? null, {
      table: "cpf_healthcare_config",
      column: "isp_annual_enc",
    })
  }
  return out
}

// ─── Decoder ─────────────────────────────────────────────────────────────

export interface CpfHealthcareConfigPiiRow {
  msl_annual_override?: number | null
  msl_annual_override_enc?: string | null
  csl_annual?: number | null
  csl_annual_enc?: string | null
  csl_supplement_annual?: number | null
  csl_supplement_annual_enc?: string | null
  isp_annual?: number | null
  isp_annual_enc?: string | null
}

export interface CpfHealthcareConfigPiiDecoded {
  msl_annual_override: number | null
  csl_annual: number | null
  csl_supplement_annual: number | null
  isp_annual: number | null
}

export function decodeCpfHealthcareConfigPii(
  row: CpfHealthcareConfigPiiRow,
): CpfHealthcareConfigPiiDecoded {
  return {
    msl_annual_override: tryNum(
      row.msl_annual_override_enc,
      row.msl_annual_override,
      "msl_annual_override_enc",
    ),
    csl_annual: tryNum(row.csl_annual_enc, row.csl_annual, "csl_annual_enc"),
    csl_supplement_annual: tryNum(
      row.csl_supplement_annual_enc,
      row.csl_supplement_annual,
      "csl_supplement_annual_enc",
    ),
    isp_annual: tryNum(row.isp_annual_enc, row.isp_annual, "isp_annual_enc"),
  }
}

function tryNum(
  enc: string | null | undefined,
  plain: number | null | undefined,
  column: string,
): number | null {
  if (enc) {
    try {
      return decryptNumber(enc, { table: "cpf_healthcare_config", column })
    } catch (err) {
      console.error(
        `[cpf_healthcare_config.decodeCpfHealthcareConfigPii] decrypt failed for ${column}, falling back:`,
        err,
      )
    }
  }
  return plain ?? null
}

export const CPF_HEALTHCARE_CONFIG_PII_SELECT =
  "msl_annual_override, msl_annual_override_enc, csl_annual, csl_annual_enc, csl_supplement_annual, csl_supplement_annual_enc, isp_annual, isp_annual_enc"
