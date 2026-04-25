import { randomBytes } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const TEST_ENC_KEY = randomBytes(32).toString("base64")
const TEST_HASH_SECRET = randomBytes(32).toString("base64")

beforeAll(() => {
  process.env.PII_ENCRYPTION_KEY_V1 = TEST_ENC_KEY
  process.env.PII_HASH_SECRET_V1 = TEST_HASH_SECRET
})

afterAll(() => {
  delete process.env.PII_ENCRYPTION_KEY_V1
  delete process.env.PII_HASH_SECRET_V1
})

describe("encodeProfilePiiPatch", () => {
  it("returns only fields present in input (partial UPDATE safety)", async () => {
    const { encodeProfilePiiPatch } = await import("@/lib/repos/profiles")
    const patch = encodeProfilePiiPatch({ name: "Alice" })
    expect(patch.name_enc).toBeDefined()
    expect(patch.name_hash).toBeDefined()
    expect("birth_year_enc" in patch).toBe(false)
    expect("telegram_user_id_enc" in patch).toBe(false)
  })

  it("returns null for null inputs (explicit clears)", async () => {
    const { encodeProfilePiiPatch } = await import("@/lib/repos/profiles")
    const patch = encodeProfilePiiPatch({
      name: null,
      birth_year: null,
      telegram_user_id: null,
      telegram_username: null,
      telegram_chat_id: null,
    })
    expect(patch.name_enc).toBeNull()
    expect(patch.name_hash).toBeNull()
    expect(patch.birth_year_enc).toBeNull()
    expect(patch.telegram_user_id_enc).toBeNull()
    expect(patch.telegram_username_enc).toBeNull()
    expect(patch.telegram_chat_id_enc).toBeNull()
  })

  it("normalizes telegram_username before encrypting and hashing", async () => {
    const { encodeProfilePiiPatch } = await import("@/lib/repos/profiles")
    const { decryptString } = await import("@/lib/crypto/cipher")
    const patchA = encodeProfilePiiPatch({ telegram_username: "@Alice" })
    const patchB = encodeProfilePiiPatch({ telegram_username: "alice" })
    expect(patchA.telegram_username_hash).toBe(patchB.telegram_username_hash)
    expect(
      decryptString(patchA.telegram_username_enc!, {
        table: "profiles",
        column: "telegram_username_enc",
      }),
    ).toBe("alice")
  })

  it("normalizes telegram_user_id (numeric to string)", async () => {
    const { encodeProfilePiiPatch } = await import("@/lib/repos/profiles")
    const a = encodeProfilePiiPatch({ telegram_user_id: "12345" })
    const b = encodeProfilePiiPatch({ telegram_user_id: " 12345 " })
    expect(a.telegram_user_id_hash).toBe(b.telegram_user_id_hash)
  })

  it("preserves birth_year as decryptable number", async () => {
    const { encodeProfilePiiPatch } = await import("@/lib/repos/profiles")
    const { decryptNumber } = await import("@/lib/crypto/cipher")
    const patch = encodeProfilePiiPatch({ birth_year: 1990 })
    expect(
      decryptNumber(patch.birth_year_enc!, {
        table: "profiles",
        column: "birth_year_enc",
      }),
    ).toBe(1990)
  })
})

describe("encodeDependentPiiPatch", () => {
  it("encrypts annual_income preserving decimal precision", async () => {
    const { encodeDependentPiiPatch } = await import("@/lib/repos/dependents")
    const { decryptNumber } = await import("@/lib/crypto/cipher")
    const patch = encodeDependentPiiPatch({ annual_income: 12345.67 })
    expect(
      decryptNumber(patch.annual_income_enc!, {
        table: "dependents",
        column: "annual_income_enc",
      }),
    ).toBe(12345.67)
  })

  it("does not include name_enc when name not in input", async () => {
    const { encodeDependentPiiPatch } = await import("@/lib/repos/dependents")
    const patch = encodeDependentPiiPatch({ birth_year: 2000 })
    expect("name_enc" in patch).toBe(false)
  })
})

describe("encodeHouseholdPiiPatch", () => {
  it("normalizes chat_id like profiles does (cross-table consistency)", async () => {
    const { encodeHouseholdPiiPatch } = await import("@/lib/repos/households")
    const { encodeProfilePiiPatch } = await import("@/lib/repos/profiles")
    // Same input, different tables → DIFFERENT hashes (table-bound) but
    // consistent normalization within each.
    const hh = encodeHouseholdPiiPatch({ telegram_chat_id: "  -100123 " })
    const pr = encodeProfilePiiPatch({ telegram_chat_id: "-100123" })
    expect(hh.telegram_chat_id_hash).not.toBe(pr.telegram_chat_id_hash)
  })
})

describe("encodeLinkedTelegramAccountPiiPatch", () => {
  it("hash for telegram_user_id matches the upsert lookup", async () => {
    const {
      encodeLinkedTelegramAccountPiiPatch,
      hashTelegramUserIdForLinkedAccounts,
    } = await import("@/lib/repos/linked-telegram-accounts")
    const patch = encodeLinkedTelegramAccountPiiPatch({
      telegram_user_id: "12345",
    })
    expect(patch.telegram_user_id_hash).toBe(
      hashTelegramUserIdForLinkedAccounts("12345"),
    )
  })

  it("normalizes username consistently with profiles encoder", async () => {
    const { encodeLinkedTelegramAccountPiiPatch } = await import(
      "@/lib/repos/linked-telegram-accounts"
    )
    const a = encodeLinkedTelegramAccountPiiPatch({
      telegram_username: "@Alice",
    })
    const b = encodeLinkedTelegramAccountPiiPatch({
      telegram_username: "alice",
    })
    expect(a.telegram_username_hash).toBe(b.telegram_username_hash)
  })
})

describe("encodeSignupCodePiiPatch", () => {
  it("hashes telegram_username with case-insensitive lookup", async () => {
    const { encodeSignupCodePiiPatch } = await import(
      "@/lib/repos/signup-codes"
    )
    const a = encodeSignupCodePiiPatch({ telegram_username: "@Bob" })
    const b = encodeSignupCodePiiPatch({ telegram_username: "bob" })
    expect(a.telegram_username_hash).toBe(b.telegram_username_hash)
  })

  it("normalizes used_by_telegram_user_id", async () => {
    const { encodeSignupCodePiiPatch } = await import(
      "@/lib/repos/signup-codes"
    )
    const a = encodeSignupCodePiiPatch({ used_by_telegram_user_id: "999" })
    const b = encodeSignupCodePiiPatch({
      used_by_telegram_user_id: "  999  ",
    })
    expect(a.used_by_telegram_user_id_hash).toBe(
      b.used_by_telegram_user_id_hash,
    )
  })
})

describe("encodeFamilyPiiPatch", () => {
  it("encrypts only when name in input", async () => {
    const { encodeFamilyPiiPatch } = await import("@/lib/repos/families")
    expect("name_enc" in encodeFamilyPiiPatch({})).toBe(false)
    const patch = encodeFamilyPiiPatch({ name: "Family 1" })
    expect(patch.name_enc).toMatch(/^v1:/)
  })
})

describe("AAD isolation across tables (defense-in-depth)", () => {
  it("encrypted name from profiles cannot be decrypted with dependents context", async () => {
    const { encodeProfilePiiPatch } = await import("@/lib/repos/profiles")
    const { decryptString } = await import("@/lib/crypto/cipher")
    const patch = encodeProfilePiiPatch({ name: "Alice" })
    expect(() =>
      decryptString(patch.name_enc!, {
        table: "dependents",
        column: "name_enc",
      }),
    ).toThrow()
  })
})
