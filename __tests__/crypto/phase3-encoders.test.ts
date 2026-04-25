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

describe("encodeBankAccountPiiPatch", () => {
  it("produces enc + hash + last4 for a normal account number", async () => {
    const { encodeBankAccountPiiPatch } = await import(
      "@/lib/repos/bank-accounts"
    )
    const patch = encodeBankAccountPiiPatch({ account_number: "1234567890" })
    expect(patch.account_number_enc).toMatch(/^v1:/)
    expect(patch.account_number_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(patch.account_number_last4).toBe("7890")
  })

  it("normalizes account number for hash (formatting-insensitive)", async () => {
    const { encodeBankAccountPiiPatch } = await import(
      "@/lib/repos/bank-accounts"
    )
    const a = encodeBankAccountPiiPatch({ account_number: "1234-5678 9012" })
    const b = encodeBankAccountPiiPatch({ account_number: "123456789012" })
    expect(a.account_number_hash).toBe(b.account_number_hash)
  })

  it("preserves original (formatted) value in ciphertext", async () => {
    const { encodeBankAccountPiiPatch } = await import(
      "@/lib/repos/bank-accounts"
    )
    const { decryptString } = await import("@/lib/crypto/cipher")
    const patch = encodeBankAccountPiiPatch({
      account_number: "1234-5678-9012",
    })
    expect(
      decryptString(patch.account_number_enc!, {
        table: "bank_accounts",
        column: "account_number_enc",
      }),
    ).toBe("1234-5678-9012")
  })

  it("last4 strips formatting before slicing", async () => {
    const { lastFourOfAccountNumber } = await import(
      "@/lib/repos/bank-accounts"
    )
    expect(lastFourOfAccountNumber("1234-5678-9012")).toBe("9012")
    expect(lastFourOfAccountNumber("12 34 5678")).toBe("5678")
  })

  it("returns null last4 for short inputs", async () => {
    const { lastFourOfAccountNumber } = await import(
      "@/lib/repos/bank-accounts"
    )
    expect(lastFourOfAccountNumber("123")).toBeNull()
    expect(lastFourOfAccountNumber("")).toBeNull()
    expect(lastFourOfAccountNumber(null)).toBeNull()
  })

  it("returns null fields when account_number is null", async () => {
    const { encodeBankAccountPiiPatch } = await import(
      "@/lib/repos/bank-accounts"
    )
    const patch = encodeBankAccountPiiPatch({ account_number: null })
    expect(patch.account_number_enc).toBeNull()
    expect(patch.account_number_hash).toBeNull()
    expect(patch.account_number_last4).toBeNull()
  })

  it("returns empty patch when account_number not in input", async () => {
    const { encodeBankAccountPiiPatch } = await import(
      "@/lib/repos/bank-accounts"
    )
    expect(encodeBankAccountPiiPatch({})).toEqual({})
  })

  it("hashBankAccountNumber matches encoder hash", async () => {
    const { encodeBankAccountPiiPatch, hashBankAccountNumber } = await import(
      "@/lib/repos/bank-accounts"
    )
    const patch = encodeBankAccountPiiPatch({ account_number: "1234-5678" })
    expect(hashBankAccountNumber("12345678")).toBe(patch.account_number_hash)
  })
})

describe("decodeBankAccountPii", () => {
  it("round-trips encrypted account number", async () => {
    const { encodeBankAccountPiiPatch, decodeBankAccountPii } = await import(
      "@/lib/repos/bank-accounts"
    )
    const enc = encodeBankAccountPiiPatch({ account_number: "1234-5678-9012" })
    const decoded = decodeBankAccountPii({
      account_number: null,
      account_number_enc: enc.account_number_enc,
      account_number_last4: enc.account_number_last4,
    })
    expect(decoded.account_number).toBe("1234-5678-9012")
    expect(decoded.account_number_last4).toBe("9012")
  })

  it("falls back to plaintext when ciphertext is null", async () => {
    const { decodeBankAccountPii } = await import("@/lib/repos/bank-accounts")
    const decoded = decodeBankAccountPii({
      account_number: "999988887777",
      account_number_enc: null,
    })
    expect(decoded.account_number).toBe("999988887777")
    expect(decoded.account_number_last4).toBe("7777")
  })
})

describe("encodeLoanPiiPatch", () => {
  it("encrypts lender and principal preserving precision", async () => {
    const { encodeLoanPiiPatch } = await import("@/lib/repos/loans")
    const { decryptString, decryptNumber } = await import("@/lib/crypto/cipher")
    const patch = encodeLoanPiiPatch({
      lender: "OCBC Housing Loan",
      principal: 450000.5,
    })
    expect(
      decryptString(patch.lender_enc!, {
        table: "loans",
        column: "lender_enc",
      }),
    ).toBe("OCBC Housing Loan")
    expect(
      decryptNumber(patch.principal_enc!, {
        table: "loans",
        column: "principal_enc",
      }),
    ).toBe(450000.5)
  })

  it("omits keys not in input (partial UPDATE safe)", async () => {
    const { encodeLoanPiiPatch } = await import("@/lib/repos/loans")
    const lenderOnly = encodeLoanPiiPatch({ lender: "DBS" })
    expect("principal_enc" in lenderOnly).toBe(false)
    expect(lenderOnly.lender_enc).toMatch(/^v1:/)
  })
})

describe("decodeLoanPii", () => {
  it("round-trips encrypted lender and principal", async () => {
    const { encodeLoanPiiPatch, decodeLoanPii } = await import(
      "@/lib/repos/loans"
    )
    const enc = encodeLoanPiiPatch({
      lender: "Standard Chartered",
      principal: 250000,
    })
    const decoded = decodeLoanPii({
      lender: null,
      lender_enc: enc.lender_enc,
      principal: null,
      principal_enc: enc.principal_enc,
    })
    expect(decoded.lender).toBe("Standard Chartered")
    expect(decoded.principal).toBe(250000)
  })

  it("falls back to plaintext when ciphertext null", async () => {
    const { decodeLoanPii } = await import("@/lib/repos/loans")
    const decoded = decodeLoanPii({
      lender: "Legacy Lender",
      principal: 100000,
    })
    expect(decoded.lender).toBe("Legacy Lender")
    expect(decoded.principal).toBe(100000)
  })
})

describe("AAD isolation across tables", () => {
  it("bank_accounts ciphertext cannot be decrypted as loans.lender", async () => {
    const { encodeBankAccountPiiPatch } = await import(
      "@/lib/repos/bank-accounts"
    )
    const { decryptString } = await import("@/lib/crypto/cipher")
    const patch = encodeBankAccountPiiPatch({ account_number: "12345678" })
    expect(() =>
      decryptString(patch.account_number_enc!, {
        table: "loans",
        column: "lender_enc",
      }),
    ).toThrow()
  })
})
