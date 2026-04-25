import {
  encryptNumberNullable,
  encryptStringNullable,
} from "@/lib/crypto/cipher"

export interface DependentPiiInput {
  name?: string | null
  birth_year?: number | null
  annual_income?: number | null
}

export function encodeDependentPiiPatch(input: DependentPiiInput): {
  name_enc?: string | null
  birth_year_enc?: string | null
  annual_income_enc?: string | null
} {
  const out: Record<string, string | null> = {}

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
