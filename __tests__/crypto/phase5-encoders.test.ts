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

describe("encodeTelegramCommandPiiPatch", () => {
  it("encrypts raw_message and args", async () => {
    const { encodeTelegramCommandPiiPatch } = await import(
      "@/lib/repos/telegram-commands"
    )
    const { decryptString } = await import("@/lib/crypto/cipher")
    const patch = encodeTelegramCommandPiiPatch({
      raw_message: "/in 123.45 lunch",
      args: "123.45 lunch",
    })
    expect(patch.raw_message_enc).toMatch(/^v1:/)
    expect(patch.args_enc).toMatch(/^v1:/)
    expect(
      decryptString(patch.raw_message_enc!, {
        table: "telegram_commands",
        column: "raw_message_enc",
      }),
    ).toBe("/in 123.45 lunch")
    expect(
      decryptString(patch.args_enc!, {
        table: "telegram_commands",
        column: "args_enc",
      }),
    ).toBe("123.45 lunch")
  })

  it("omits keys not in input (partial UPDATE safe)", async () => {
    const { encodeTelegramCommandPiiPatch } = await import(
      "@/lib/repos/telegram-commands"
    )
    const rawOnly = encodeTelegramCommandPiiPatch({ raw_message: "hello" })
    expect("args_enc" in rawOnly).toBe(false)
    expect(rawOnly.raw_message_enc).toMatch(/^v1:/)
  })

  it("returns null fields when input is null", async () => {
    const { encodeTelegramCommandPiiPatch } = await import(
      "@/lib/repos/telegram-commands"
    )
    const patch = encodeTelegramCommandPiiPatch({
      raw_message: null,
      args: null,
    })
    expect(patch.raw_message_enc).toBeNull()
    expect(patch.args_enc).toBeNull()
  })
})

describe("decodeTelegramCommandPii", () => {
  it("round-trips encrypted raw_message and args", async () => {
    const { encodeTelegramCommandPiiPatch, decodeTelegramCommandPii } =
      await import("@/lib/repos/telegram-commands")
    const enc = encodeTelegramCommandPiiPatch({
      raw_message: "/out 50 groceries",
      args: "50 groceries",
    })
    const decoded = decodeTelegramCommandPii({
      raw_message: null,
      raw_message_enc: enc.raw_message_enc,
      args: null,
      args_enc: enc.args_enc,
    })
    expect(decoded.raw_message).toBe("/out 50 groceries")
    expect(decoded.args).toBe("50 groceries")
  })

  it("falls back to plaintext when ciphertext is null", async () => {
    const { decodeTelegramCommandPii } = await import(
      "@/lib/repos/telegram-commands"
    )
    const decoded = decodeTelegramCommandPii({
      raw_message: "legacy text",
      args: "legacy args",
    })
    expect(decoded.raw_message).toBe("legacy text")
    expect(decoded.args).toBe("legacy args")
  })
})

describe("AAD isolation", () => {
  it("telegram_commands.raw_message_enc cannot be decrypted as args_enc", async () => {
    const { encodeTelegramCommandPiiPatch } = await import(
      "@/lib/repos/telegram-commands"
    )
    const { decryptString } = await import("@/lib/crypto/cipher")
    const patch = encodeTelegramCommandPiiPatch({ raw_message: "secret" })
    expect(() =>
      decryptString(patch.raw_message_enc!, {
        table: "telegram_commands",
        column: "args_enc",
      }),
    ).toThrow()
  })
})
