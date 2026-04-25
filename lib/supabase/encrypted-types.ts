import type { EncryptedString } from "@/lib/crypto/cipher"
import type { Database as RawDatabase } from "./database.types"

// Replace the `string` member of any `*_enc` field's type union with the
// branded `EncryptedString`. `string | null` becomes `EncryptedString | null`,
// preserving optionality (`?`) and any other union members.
type BrandEncFields<T> = {
  [K in keyof T]: K extends `${string}_enc`
    ? Exclude<T[K], string> | EncryptedString
    : T[K]
}

type BrandTable<T> = T extends {
  Row: infer R
  Insert: infer I
  Update: infer U
}
  ? Omit<T, "Row" | "Insert" | "Update"> & {
      Row: BrandEncFields<R>
      Insert: BrandEncFields<I>
      Update: BrandEncFields<U>
    }
  : T

type BrandTables<T> = { [K in keyof T]: BrandTable<T[K]> }

export type Database = Omit<RawDatabase, "public"> & {
  public: Omit<RawDatabase["public"], "Tables"> & {
    Tables: BrandTables<RawDatabase["public"]["Tables"]>
  }
}

export type { Json } from "./database.types"
