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

describe("crypto/cipher", () => {
  it("round-trips strings", async () => {
    const { encryptString, decryptString } = await import("@/lib/crypto/cipher")
    const ctx = { table: "profiles", column: "name_enc" }
    const blob = encryptString("Ivan Yeo", ctx)
    expect(blob).toMatch(/^v1:/)
    expect(decryptString(blob, ctx)).toBe("Ivan Yeo")
  })

  it("produces different ciphertext for same plaintext (random IV)", async () => {
    const { encryptString } = await import("@/lib/crypto/cipher")
    const ctx = { table: "profiles", column: "name_enc" }
    const a = encryptString("hello", ctx)
    const b = encryptString("hello", ctx)
    expect(a).not.toBe(b)
  })

  it("round-trips numbers preserving precision", async () => {
    const { encryptNumber, decryptNumber } = await import("@/lib/crypto/cipher")
    const ctx = { table: "monthly_cashflow", column: "inflow_enc" }
    const blob = encryptNumber(12345.67, ctx)
    expect(decryptNumber(blob, ctx)).toBe(12345.67)
  })

  it("round-trips JSON blobs", async () => {
    const { encryptJson, decryptJson } = await import("@/lib/crypto/cipher")
    const ctx = { table: "tax_noa_data", column: "reliefs_json_enc" }
    const payload = { earnedIncome: 1000, courseFees: 5500, parents: [{ id: 1 }] }
    const blob = encryptJson(payload, ctx)
    expect(decryptJson<typeof payload>(blob, ctx)).toEqual(payload)
  })

  it("nullable helpers pass null through", async () => {
    const { encryptStringNullable, decryptStringNullable } = await import(
      "@/lib/crypto/cipher"
    )
    const ctx = { table: "profiles", column: "name_enc" }
    expect(encryptStringNullable(null, ctx)).toBeNull()
    expect(decryptStringNullable(null, ctx)).toBeNull()
  })

  it("rejects ciphertext decrypted with wrong AAD (cross-column swap)", async () => {
    const { encryptString, decryptString } = await import("@/lib/crypto/cipher")
    const blob = encryptString("secret", {
      table: "profiles",
      column: "name_enc",
    })
    expect(() =>
      decryptString(blob, { table: "profiles", column: "telegram_user_id_enc" }),
    ).toThrow()
  })

  it("rejects ciphertext decrypted with wrong table AAD", async () => {
    const { encryptString, decryptString } = await import("@/lib/crypto/cipher")
    const blob = encryptString("secret", {
      table: "profiles",
      column: "name_enc",
    })
    expect(() =>
      decryptString(blob, { table: "dependents", column: "name_enc" }),
    ).toThrow()
  })

  it("rejects tampered ciphertext", async () => {
    const { encryptString, decryptString } = await import("@/lib/crypto/cipher")
    const ctx = { table: "profiles", column: "name_enc" }
    const blob = encryptString("hello", ctx)
    const idx = blob.length - 5
    const tampered = blob.slice(0, idx) + (blob[idx] === "A" ? "B" : "A") + blob.slice(idx + 1)
    expect(() => decryptString(tampered, ctx)).toThrow()
  })

  it("rejects ciphertext missing version prefix", async () => {
    const { decryptString } = await import("@/lib/crypto/cipher")
    expect(() =>
      decryptString("not-a-real-ciphertext", { table: "t", column: "c" }),
    ).toThrow(/version/i)
  })

  it("rejects unsupported version", async () => {
    const { decryptString } = await import("@/lib/crypto/cipher")
    expect(() =>
      decryptString("v9:abc", { table: "t", column: "c" }),
    ).toThrow(/version/i)
  })

  it("rejects non-finite numbers on encrypt", async () => {
    const { encryptNumber } = await import("@/lib/crypto/cipher")
    const ctx = { table: "t", column: "c" }
    expect(() => encryptNumber(Number.NaN, ctx)).toThrow()
    expect(() => encryptNumber(Number.POSITIVE_INFINITY, ctx)).toThrow()
  })
})

describe("crypto/hash", () => {
  it("is deterministic for same input + context", async () => {
    const { deterministicHash } = await import("@/lib/crypto/hash")
    const ctx = { table: "profiles", column: "telegram_user_id_hash" }
    expect(deterministicHash("12345", ctx)).toBe(deterministicHash("12345", ctx))
  })

  it("differs across columns (context binding)", async () => {
    const { deterministicHash } = await import("@/lib/crypto/hash")
    const a = deterministicHash("12345", {
      table: "profiles",
      column: "telegram_user_id_hash",
    })
    const b = deterministicHash("12345", {
      table: "profiles",
      column: "telegram_chat_id_hash",
    })
    expect(a).not.toBe(b)
  })

  it("differs across tables (context binding)", async () => {
    const { deterministicHash } = await import("@/lib/crypto/hash")
    const a = deterministicHash("12345", {
      table: "profiles",
      column: "telegram_user_id_hash",
    })
    const b = deterministicHash("12345", {
      table: "linked_telegram_accounts",
      column: "telegram_user_id_hash",
    })
    expect(a).not.toBe(b)
  })

  it("returns 64-char hex", async () => {
    const { deterministicHash } = await import("@/lib/crypto/hash")
    const out = deterministicHash("anything", { table: "t", column: "c" })
    expect(out).toMatch(/^[0-9a-f]{64}$/)
  })

  it("normalizeTelegramUsername strips @ and lowercases", async () => {
    const { normalizeTelegramUsername } = await import("@/lib/crypto/hash")
    expect(normalizeTelegramUsername("@Alice")).toBe("alice")
    expect(normalizeTelegramUsername(" Bob ")).toBe("bob")
    expect(normalizeTelegramUsername("@CaSeY")).toBe("casey")
  })

  it("normalizeTelegramUsername makes hashes match across casings", async () => {
    const { deterministicHash, normalizeTelegramUsername } = await import(
      "@/lib/crypto/hash"
    )
    const ctx = { table: "profiles", column: "telegram_username_hash" }
    const a = deterministicHash(normalizeTelegramUsername("@Alice"), ctx)
    const b = deterministicHash(normalizeTelegramUsername("alice"), ctx)
    expect(a).toBe(b)
  })

  it("normalizeAccountNumber strips spaces and hyphens", async () => {
    const { normalizeAccountNumber } = await import("@/lib/crypto/hash")
    expect(normalizeAccountNumber("1234-5678 9012")).toBe("123456789012")
  })

  it("nullable hash returns null for empty input", async () => {
    const { deterministicHashNullable } = await import("@/lib/crypto/hash")
    const ctx = { table: "t", column: "c" }
    expect(deterministicHashNullable(null, ctx)).toBeNull()
    expect(deterministicHashNullable("", ctx)).toBeNull()
    expect(deterministicHashNullable(undefined, ctx)).toBeNull()
  })
})

describe("crypto/keys", () => {
  it("rejects encryption keys that are not 32 bytes", async () => {
    const { __resetKeyCacheForTests } = await import("@/lib/crypto/keys")
    const original = process.env.PII_ENCRYPTION_KEY_V1
    process.env.PII_ENCRYPTION_KEY_V1 = randomBytes(16).toString("base64")
    __resetKeyCacheForTests()
    const { assertCryptoConfigured } = await import("@/lib/crypto/keys")
    expect(() => assertCryptoConfigured()).toThrow(/32 bytes/)
    process.env.PII_ENCRYPTION_KEY_V1 = original
    __resetKeyCacheForTests()
  })

  it("throws when current-version env vars are missing", async () => {
    const { __resetKeyCacheForTests } = await import("@/lib/crypto/keys")
    const originalEnc = process.env.PII_ENCRYPTION_KEY_V1
    const originalHash = process.env.PII_HASH_SECRET_V1
    delete process.env.PII_ENCRYPTION_KEY_V1
    delete process.env.PII_HASH_SECRET_V1
    __resetKeyCacheForTests()
    const { assertCryptoConfigured } = await import("@/lib/crypto/keys")
    expect(() => assertCryptoConfigured()).toThrow(/PII_ENCRYPTION_KEY_V1/)
    process.env.PII_ENCRYPTION_KEY_V1 = originalEnc
    process.env.PII_HASH_SECRET_V1 = originalHash
    __resetKeyCacheForTests()
  })
})
