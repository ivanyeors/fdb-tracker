import {
  decryptString,
  encryptStringNullable,
  type EncryptedString,
} from "@/lib/crypto/cipher"

export interface FamilyPiiInput {
  name?: string | null
}

export function encodeFamilyPiiPatch(input: FamilyPiiInput): {
  name_enc?: EncryptedString | null
} {
  const out: { name_enc?: EncryptedString | null } = {}

  if ("name" in input) {
    out.name_enc = encryptStringNullable(input.name ?? null, {
      table: "families",
      column: "name_enc",
    })
  }

  return out
}

// ─── Decoder ─────────────────────────────────────────────────────────────

export interface FamilyPiiRow {
  name?: string | null
  name_enc?: string | null
}

export function decodeFamilyName(row: FamilyPiiRow): string | null {
  if (row.name_enc) {
    try {
      return decryptString(row.name_enc, {
        table: "families",
        column: "name_enc",
      })
    } catch (err) {
      console.error(
        "[families.decodeFamilyName] decrypt failed, falling back to plaintext:",
        err,
      )
    }
  }
  return row.name ?? null
}

export const FAMILY_PII_SELECT = "name, name_enc"
