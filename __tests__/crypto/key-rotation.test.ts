import { randomBytes } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const V1_ENC_KEY = randomBytes(32).toString("base64")
const V2_ENC_KEY = randomBytes(32).toString("base64")
const HASH_SECRET = randomBytes(32).toString("base64")

function clearAllKeyEnv() {
  delete process.env.PII_ENCRYPTION_KEY_V1
  delete process.env.PII_HASH_SECRET_V1
  delete process.env.PII_ENCRYPTION_KEY_V2
  delete process.env.PII_HASH_SECRET_V2
  delete process.env.PII_CURRENT_KEY_VERSION
}

beforeEach(() => {
  clearAllKeyEnv()
  vi.resetModules()
})

afterEach(() => {
  clearAllKeyEnv()
  vi.resetModules()
})

describe("key version support", () => {
  it("v2 is a supported version", async () => {
    const { isSupportedVersion } = await import("@/lib/crypto/keys")
    expect(isSupportedVersion("v1")).toBe(true)
    expect(isSupportedVersion("v2")).toBe(true)
    expect(isSupportedVersion("v3")).toBe(false)
  })

  it("CURRENT_KEY_VERSION defaults to v1", async () => {
    process.env.PII_ENCRYPTION_KEY_V1 = V1_ENC_KEY
    process.env.PII_HASH_SECRET_V1 = HASH_SECRET
    const { CURRENT_KEY_VERSION } = await import("@/lib/crypto/keys")
    expect(CURRENT_KEY_VERSION).toBe("v1")
  })

  it("CURRENT_KEY_VERSION reads PII_CURRENT_KEY_VERSION override", async () => {
    process.env.PII_ENCRYPTION_KEY_V1 = V1_ENC_KEY
    process.env.PII_HASH_SECRET_V1 = HASH_SECRET
    process.env.PII_ENCRYPTION_KEY_V2 = V2_ENC_KEY
    process.env.PII_HASH_SECRET_V2 = HASH_SECRET
    process.env.PII_CURRENT_KEY_VERSION = "v2"
    const { CURRENT_KEY_VERSION } = await import("@/lib/crypto/keys")
    expect(CURRENT_KEY_VERSION).toBe("v2")
  })

  it("falls back to v1 when override is unsupported", async () => {
    process.env.PII_ENCRYPTION_KEY_V1 = V1_ENC_KEY
    process.env.PII_HASH_SECRET_V1 = HASH_SECRET
    process.env.PII_CURRENT_KEY_VERSION = "v9"
    const { CURRENT_KEY_VERSION } = await import("@/lib/crypto/keys")
    expect(CURRENT_KEY_VERSION).toBe("v1")
  })
})

describe("rotation: v1 → v2 ciphertext round-trip", () => {
  it("v1 ciphertext is decryptable while v1 key remains configured under v2 current", async () => {
    process.env.PII_ENCRYPTION_KEY_V1 = V1_ENC_KEY
    process.env.PII_HASH_SECRET_V1 = HASH_SECRET
    const { encryptString: encryptV1 } = await import("@/lib/crypto/cipher")
    const ctx = { table: "profiles", column: "name_enc" }
    const v1Blob = encryptV1("Ivan Yeo", ctx)
    expect(v1Blob).toMatch(/^v1:/)

    // Reload cipher with both keys + v2 as current
    vi.resetModules()
    process.env.PII_ENCRYPTION_KEY_V2 = V2_ENC_KEY
    process.env.PII_HASH_SECRET_V2 = HASH_SECRET
    process.env.PII_CURRENT_KEY_VERSION = "v2"
    const { decryptString } = await import("@/lib/crypto/cipher")
    expect(decryptString(v1Blob, ctx)).toBe("Ivan Yeo")
  })

  it("re-encrypting under v2 current produces a v2-prefixed ciphertext", async () => {
    process.env.PII_ENCRYPTION_KEY_V1 = V1_ENC_KEY
    process.env.PII_HASH_SECRET_V1 = HASH_SECRET
    const { encryptString: encryptV1 } = await import("@/lib/crypto/cipher")
    const ctx = { table: "loans", column: "principal_enc" }
    const v1Blob = encryptV1("450000.50", ctx)

    vi.resetModules()
    process.env.PII_ENCRYPTION_KEY_V2 = V2_ENC_KEY
    process.env.PII_HASH_SECRET_V2 = HASH_SECRET
    process.env.PII_CURRENT_KEY_VERSION = "v2"
    const { decryptString, encryptString } = await import("@/lib/crypto/cipher")
    const plaintext = decryptString(v1Blob, ctx)
    const v2Blob = encryptString(plaintext, ctx)
    expect(v2Blob).toMatch(/^v2:/)
    expect(decryptString(v2Blob, ctx)).toBe("450000.50")
  })

  it("v1 ciphertext fails to decrypt when only v2 key is configured", async () => {
    process.env.PII_ENCRYPTION_KEY_V1 = V1_ENC_KEY
    process.env.PII_HASH_SECRET_V1 = HASH_SECRET
    const { encryptString: encryptV1 } = await import("@/lib/crypto/cipher")
    const ctx = { table: "profiles", column: "name_enc" }
    const v1Blob = encryptV1("Alice", ctx)

    vi.resetModules()
    delete process.env.PII_ENCRYPTION_KEY_V1
    delete process.env.PII_HASH_SECRET_V1
    process.env.PII_ENCRYPTION_KEY_V2 = V2_ENC_KEY
    process.env.PII_HASH_SECRET_V2 = HASH_SECRET
    process.env.PII_CURRENT_KEY_VERSION = "v2"
    const { decryptString } = await import("@/lib/crypto/cipher")
    expect(() => decryptString(v1Blob, ctx)).toThrow()
  })

  it("v2 ciphertext from a different v2 key fails to decrypt", async () => {
    process.env.PII_ENCRYPTION_KEY_V1 = V1_ENC_KEY
    process.env.PII_HASH_SECRET_V1 = HASH_SECRET
    process.env.PII_ENCRYPTION_KEY_V2 = V2_ENC_KEY
    process.env.PII_HASH_SECRET_V2 = HASH_SECRET
    process.env.PII_CURRENT_KEY_VERSION = "v2"
    const { encryptString } = await import("@/lib/crypto/cipher")
    const ctx = { table: "profiles", column: "name_enc" }
    const v2Blob = encryptString("secret", ctx)
    expect(v2Blob).toMatch(/^v2:/)

    vi.resetModules()
    // Swap the v2 key — same plaintext can no longer be decrypted with the
    // wrong key, even though the version prefix matches.
    process.env.PII_ENCRYPTION_KEY_V1 = V1_ENC_KEY
    process.env.PII_HASH_SECRET_V1 = HASH_SECRET
    process.env.PII_ENCRYPTION_KEY_V2 = randomBytes(32).toString("base64")
    process.env.PII_HASH_SECRET_V2 = HASH_SECRET
    process.env.PII_CURRENT_KEY_VERSION = "v2"
    const { decryptString } = await import("@/lib/crypto/cipher")
    expect(() => decryptString(v2Blob, ctx)).toThrow()
  })
})
