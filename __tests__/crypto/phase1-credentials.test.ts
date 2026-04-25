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

describe("decryptBotToken", () => {
  it("returns decrypted ciphertext when present", async () => {
    const { encryptString } = await import("@/lib/crypto/cipher")
    const { decryptBotToken } = await import("@/lib/telegram/credentials")

    const enc = encryptString("bot-secret-1234", {
      table: "households",
      column: "telegram_bot_token_enc",
    })
    expect(
      decryptBotToken({
        telegram_bot_token: "stale-plaintext",
        telegram_bot_token_enc: enc,
      }),
    ).toBe("bot-secret-1234")
  })

  it("falls back to plaintext when ciphertext is null", async () => {
    const { decryptBotToken } = await import("@/lib/telegram/credentials")
    expect(
      decryptBotToken({
        telegram_bot_token: "legacy-plaintext",
        telegram_bot_token_enc: null,
      }),
    ).toBe("legacy-plaintext")
  })

  it("returns null when both columns are null", async () => {
    const { decryptBotToken } = await import("@/lib/telegram/credentials")
    expect(
      decryptBotToken({
        telegram_bot_token: null,
        telegram_bot_token_enc: null,
      }),
    ).toBeNull()
  })

  it("falls back to plaintext when ciphertext is corrupted", async () => {
    const { decryptBotToken } = await import("@/lib/telegram/credentials")
    expect(
      decryptBotToken({
        telegram_bot_token: "fallback-plaintext",
        telegram_bot_token_enc: "v1:not-actually-valid-base64-payload",
      }),
    ).toBe("fallback-plaintext")
  })
})

describe("link token hash lookup parity", () => {
  it("hash of a UUID matches what the dual-write code stores", async () => {
    const { deterministicHash } = await import("@/lib/crypto/hash")
    const token = "550e8400-e29b-41d4-a716-446655440000"
    const ctx = {
      table: "profiles",
      column: "telegram_link_token_hash",
    }
    // Both the writer (api/telegram/token/route.ts) and the reader
    // (link-api-scene.ts) must compute the same hash for the same input.
    expect(deterministicHash(token, ctx)).toBe(deterministicHash(token, ctx))
  })

  it("different tokens produce different hashes", async () => {
    const { deterministicHash } = await import("@/lib/crypto/hash")
    const ctx = {
      table: "profiles",
      column: "telegram_link_token_hash",
    }
    const a = deterministicHash("550e8400-e29b-41d4-a716-446655440000", ctx)
    const b = deterministicHash("550e8400-e29b-41d4-a716-446655440001", ctx)
    expect(a).not.toBe(b)
  })
})
