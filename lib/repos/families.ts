import { encryptStringNullable } from "@/lib/crypto/cipher"

export interface FamilyPiiInput {
  name?: string | null
}

export function encodeFamilyPiiPatch(input: FamilyPiiInput): {
  name_enc?: string | null
} {
  const out: Record<string, string | null> = {}

  if ("name" in input) {
    out.name_enc = encryptStringNullable(input.name ?? null, {
      table: "families",
      column: "name_enc",
    })
  }

  return out
}
