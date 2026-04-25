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

describe("decodeProfilePii", () => {
  it("round-trips encoded fields", async () => {
    const { encodeProfilePiiPatch, decodeProfilePii } = await import(
      "@/lib/repos/profiles"
    )
    const encoded = encodeProfilePiiPatch({
      name: "Alice",
      birth_year: 1990,
      telegram_user_id: "12345",
      telegram_username: "@Alice",
      telegram_chat_id: "-100789",
    })
    const decoded = decodeProfilePii({
      name: null,
      name_enc: encoded.name_enc,
      birth_year: null,
      birth_year_enc: encoded.birth_year_enc,
      telegram_user_id: null,
      telegram_user_id_enc: encoded.telegram_user_id_enc,
      telegram_username: null,
      telegram_username_enc: encoded.telegram_username_enc,
      telegram_chat_id: null,
      telegram_chat_id_enc: encoded.telegram_chat_id_enc,
    })
    expect(decoded.name).toBe("Alice")
    expect(decoded.birth_year).toBe(1990)
    expect(decoded.telegram_user_id).toBe("12345")
    expect(decoded.telegram_username).toBe("alice")
    expect(decoded.telegram_chat_id).toBe("-100789")
  })

  it("falls back to plaintext when ciphertext is null", async () => {
    const { decodeProfilePii } = await import("@/lib/repos/profiles")
    const decoded = decodeProfilePii({
      name: "Legacy",
      name_enc: null,
      birth_year: 1985,
      birth_year_enc: null,
    })
    expect(decoded.name).toBe("Legacy")
    expect(decoded.birth_year).toBe(1985)
  })

  it("returns null when both columns are null", async () => {
    const { decodeProfilePii } = await import("@/lib/repos/profiles")
    const decoded = decodeProfilePii({})
    expect(decoded.name).toBeNull()
    expect(decoded.birth_year).toBeNull()
    expect(decoded.telegram_user_id).toBeNull()
  })

  it("falls back to plaintext when ciphertext is corrupted", async () => {
    const { decodeProfilePii } = await import("@/lib/repos/profiles")
    const decoded = decodeProfilePii({
      name: "Fallback",
      name_enc: "v1:not-a-real-base64-payload",
    })
    expect(decoded.name).toBe("Fallback")
  })
})

describe("decodeDependentPii", () => {
  it("round-trips with decimal precision", async () => {
    const { encodeDependentPiiPatch, decodeDependentPii } = await import(
      "@/lib/repos/dependents"
    )
    const encoded = encodeDependentPiiPatch({
      name: "Junior",
      birth_year: 2010,
      annual_income: 1234.56,
    })
    const decoded = decodeDependentPii({
      name: null,
      name_enc: encoded.name_enc,
      birth_year: null,
      birth_year_enc: encoded.birth_year_enc,
      annual_income: null,
      annual_income_enc: encoded.annual_income_enc,
    })
    expect(decoded.name).toBe("Junior")
    expect(decoded.birth_year).toBe(2010)
    expect(decoded.annual_income).toBe(1234.56)
  })
})

describe("decodeFamilyName", () => {
  it("prefers ciphertext over plaintext", async () => {
    const { encodeFamilyPiiPatch, decodeFamilyName } = await import(
      "@/lib/repos/families"
    )
    const encoded = encodeFamilyPiiPatch({ name: "Smith Family" })
    expect(
      decodeFamilyName({
        name: "Stale Name",
        name_enc: encoded.name_enc,
      }),
    ).toBe("Smith Family")
  })
})

describe("Lookup hash parity (encoder ↔ finder)", () => {
  it("profile telegram_user_id hash matches", async () => {
    const { encodeProfilePiiPatch, hashProfileTelegramUserId } = await import(
      "@/lib/repos/profiles"
    )
    const patch = encodeProfilePiiPatch({ telegram_user_id: "12345" })
    expect(hashProfileTelegramUserId("12345")).toBe(patch.telegram_user_id_hash)
  })

  it("profile telegram_username hash is case-insensitive", async () => {
    const { encodeProfilePiiPatch, hashProfileTelegramUsername } = await import(
      "@/lib/repos/profiles"
    )
    const patch = encodeProfilePiiPatch({ telegram_username: "@Alice" })
    expect(hashProfileTelegramUsername("alice")).toBe(
      patch.telegram_username_hash,
    )
  })

  it("household telegram_chat_id hash matches", async () => {
    const { encodeHouseholdPiiPatch, hashHouseholdTelegramChatId } =
      await import("@/lib/repos/households")
    const patch = encodeHouseholdPiiPatch({ telegram_chat_id: "-100123" })
    expect(hashHouseholdTelegramChatId("-100123")).toBe(
      patch.telegram_chat_id_hash,
    )
  })

  it("linked_telegram_accounts username hash matches", async () => {
    const {
      encodeLinkedTelegramAccountPiiPatch,
      hashTelegramUsernameForLinkedAccounts,
    } = await import("@/lib/repos/linked-telegram-accounts")
    const patch = encodeLinkedTelegramAccountPiiPatch({
      telegram_username: "@Bob",
    })
    expect(hashTelegramUsernameForLinkedAccounts("bob")).toBe(
      patch.telegram_username_hash,
    )
  })

  it("signup_codes username hash matches", async () => {
    const { encodeSignupCodePiiPatch, hashSignupCodeTelegramUsername } =
      await import("@/lib/repos/signup-codes")
    const patch = encodeSignupCodePiiPatch({ telegram_username: "@Carol" })
    expect(hashSignupCodeTelegramUsername("carol")).toBe(
      patch.telegram_username_hash,
    )
  })
})

describe("Cross-table hash isolation", () => {
  it("profile vs household chat_id hashes differ for same input", async () => {
    const { hashProfileTelegramChatId } = await import(
      "@/lib/repos/profiles"
    )
    const { hashHouseholdTelegramChatId } = await import(
      "@/lib/repos/households"
    )
    expect(hashProfileTelegramChatId("-100123")).not.toBe(
      hashHouseholdTelegramChatId("-100123"),
    )
  })

  it("profile vs linked_telegram_accounts user_id hashes differ", async () => {
    const { hashProfileTelegramUserId } = await import(
      "@/lib/repos/profiles"
    )
    const { hashTelegramUserIdForLinkedAccounts } = await import(
      "@/lib/repos/linked-telegram-accounts"
    )
    expect(hashProfileTelegramUserId("12345")).not.toBe(
      hashTelegramUserIdForLinkedAccounts("12345"),
    )
  })
})
