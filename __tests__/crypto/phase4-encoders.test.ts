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

// ─── bank_transactions ──────────────────────────────────────────────────

describe("encodeBankTransactionPiiPatch", () => {
  it("produces enc + hash for amount, enc for balance", async () => {
    const { encodeBankTransactionPiiPatch } = await import(
      "@/lib/repos/bank-transactions"
    )
    const patch = encodeBankTransactionPiiPatch({
      amount: 12.5,
      balance: 1234.56,
    })
    expect(patch.amount_enc).toMatch(/^v1:/)
    expect(patch.amount_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(patch.balance_enc).toMatch(/^v1:/)
  })

  it("amount_hash uses canonical 2-decimal form (1000 == 1000.00)", async () => {
    const { encodeBankTransactionPiiPatch } = await import(
      "@/lib/repos/bank-transactions"
    )
    const a = encodeBankTransactionPiiPatch({ amount: 1000 })
    const b = encodeBankTransactionPiiPatch({ amount: 1000.0 })
    const c = encodeBankTransactionPiiPatch({ amount: 1000.001 })
    expect(a.amount_hash).toBe(b.amount_hash)
    expect(a.amount_hash).toBe(c.amount_hash) // rounds to 1000.00
  })

  it("hashBankTransactionAmount matches encoder hash", async () => {
    const { encodeBankTransactionPiiPatch, hashBankTransactionAmount } =
      await import("@/lib/repos/bank-transactions")
    const patch = encodeBankTransactionPiiPatch({ amount: 42.42 })
    expect(hashBankTransactionAmount(42.42)).toBe(patch.amount_hash)
  })

  it("partial input — only encodes provided fields", async () => {
    const { encodeBankTransactionPiiPatch } = await import(
      "@/lib/repos/bank-transactions"
    )
    const amountOnly = encodeBankTransactionPiiPatch({ amount: 10 })
    expect("balance_enc" in amountOnly).toBe(false)
    expect(amountOnly.amount_enc).toMatch(/^v1:/)
  })
})

describe("decodeBankTransactionPii", () => {
  it("round-trips amount and balance", async () => {
    const { encodeBankTransactionPiiPatch, decodeBankTransactionPii } =
      await import("@/lib/repos/bank-transactions")
    const enc = encodeBankTransactionPiiPatch({
      amount: 99.99,
      balance: 5000,
    })
    const decoded = decodeBankTransactionPii({
      amount: null,
      amount_enc: enc.amount_enc,
      balance: null,
      balance_enc: enc.balance_enc,
    })
    expect(decoded.amount).toBe(99.99)
    expect(decoded.balance).toBe(5000)
  })

  it("falls back to plaintext when ciphertext is null", async () => {
    const { decodeBankTransactionPii } = await import(
      "@/lib/repos/bank-transactions"
    )
    const decoded = decodeBankTransactionPii({
      amount: 12.34,
      balance: 100,
    })
    expect(decoded.amount).toBe(12.34)
    expect(decoded.balance).toBe(100)
  })
})

// ─── monthly_cashflow ───────────────────────────────────────────────────

describe("encodeMonthlyCashflowPiiPatch + decodeMonthlyCashflowPii", () => {
  it("round-trips inflow/outflow", async () => {
    const { encodeMonthlyCashflowPiiPatch, decodeMonthlyCashflowPii } =
      await import("@/lib/repos/monthly-cashflow")
    const patch = encodeMonthlyCashflowPiiPatch({
      inflow: 8000,
      outflow: 4500.25,
    })
    const decoded = decodeMonthlyCashflowPii({
      inflow: null,
      inflow_enc: patch.inflow_enc,
      outflow: null,
      outflow_enc: patch.outflow_enc,
    })
    expect(decoded.inflow).toBe(8000)
    expect(decoded.outflow).toBe(4500.25)
  })
})

// ─── income_config ──────────────────────────────────────────────────────

describe("encodeIncomeConfigPiiPatch + decodeIncomeConfigPii", () => {
  it("round-trips annual_salary + bonus_estimate", async () => {
    const { encodeIncomeConfigPiiPatch, decodeIncomeConfigPii } = await import(
      "@/lib/repos/income-config"
    )
    const patch = encodeIncomeConfigPiiPatch({
      annual_salary: 96000,
      bonus_estimate: 12000,
    })
    const decoded = decodeIncomeConfigPii({
      annual_salary: null,
      annual_salary_enc: patch.annual_salary_enc,
      bonus_estimate: null,
      bonus_estimate_enc: patch.bonus_estimate_enc,
    })
    expect(decoded.annual_salary).toBe(96000)
    expect(decoded.bonus_estimate).toBe(12000)
  })
})

// ─── income_history ─────────────────────────────────────────────────────

describe("encodeIncomeHistoryPiiPatch + decodeIncomeHistoryPii", () => {
  it("round-trips monthly_salary", async () => {
    const { encodeIncomeHistoryPiiPatch, decodeIncomeHistoryPii } =
      await import("@/lib/repos/income-history")
    const patch = encodeIncomeHistoryPiiPatch({ monthly_salary: 8500 })
    const decoded = decodeIncomeHistoryPii({
      monthly_salary: null,
      monthly_salary_enc: patch.monthly_salary_enc,
    })
    expect(decoded.monthly_salary).toBe(8500)
  })
})

// ─── cpf_balances ───────────────────────────────────────────────────────

describe("encodeCpfBalancesPiiPatch + decodeCpfBalancesPii", () => {
  it("round-trips OA/SA/MA", async () => {
    const { encodeCpfBalancesPiiPatch, decodeCpfBalancesPii } = await import(
      "@/lib/repos/cpf-balances"
    )
    const patch = encodeCpfBalancesPiiPatch({
      oa: 50000,
      sa: 30000.5,
      ma: 70000,
    })
    const decoded = decodeCpfBalancesPii({
      oa: null,
      oa_enc: patch.oa_enc,
      sa: null,
      sa_enc: patch.sa_enc,
      ma: null,
      ma_enc: patch.ma_enc,
    })
    expect(decoded.oa).toBe(50000)
    expect(decoded.sa).toBe(30000.5)
    expect(decoded.ma).toBe(70000)
  })
})

// ─── cpf_healthcare_config ──────────────────────────────────────────────

describe("encodeCpfHealthcareConfigPiiPatch", () => {
  it("round-trips all four healthcare premium fields", async () => {
    const {
      encodeCpfHealthcareConfigPiiPatch,
      decodeCpfHealthcareConfigPii,
    } = await import("@/lib/repos/cpf-healthcare-config")
    const patch = encodeCpfHealthcareConfigPiiPatch({
      msl_annual_override: 800,
      csl_annual: 1200,
      csl_supplement_annual: 300,
      isp_annual: 1500,
    })
    const decoded = decodeCpfHealthcareConfigPii({
      msl_annual_override: null,
      msl_annual_override_enc: patch.msl_annual_override_enc,
      csl_annual: null,
      csl_annual_enc: patch.csl_annual_enc,
      csl_supplement_annual: null,
      csl_supplement_annual_enc: patch.csl_supplement_annual_enc,
      isp_annual: null,
      isp_annual_enc: patch.isp_annual_enc,
    })
    expect(decoded.msl_annual_override).toBe(800)
    expect(decoded.csl_annual).toBe(1200)
    expect(decoded.csl_supplement_annual).toBe(300)
    expect(decoded.isp_annual).toBe(1500)
  })

  it("preserves null msl_annual_override (override unset)", async () => {
    const { encodeCpfHealthcareConfigPiiPatch } = await import(
      "@/lib/repos/cpf-healthcare-config"
    )
    const patch = encodeCpfHealthcareConfigPiiPatch({
      msl_annual_override: null,
    })
    expect(patch.msl_annual_override_enc).toBeNull()
  })
})

// ─── tax_noa_data ───────────────────────────────────────────────────────

describe("encodeTaxNoaDataPiiPatch + decodeTaxNoaDataPii", () => {
  it("round-trips numeric + jsonb fields", async () => {
    const { encodeTaxNoaDataPiiPatch, decodeTaxNoaDataPii } = await import(
      "@/lib/repos/tax-noa-data"
    )
    const reliefs = [
      { type: "earned_income", amount: 1000 },
      { type: "cpf_top_up", amount: 7000 },
    ]
    const patch = encodeTaxNoaDataPiiPatch({
      employment_income: 120000,
      chargeable_income: 110000,
      total_deductions: 8000,
      donations_deduction: 500,
      reliefs_total: 8000,
      tax_payable: 4500,
      reliefs_json: reliefs,
      bracket_summary_json: { brackets: [] },
    })
    const decoded = decodeTaxNoaDataPii({
      employment_income: null,
      employment_income_enc: patch.employment_income_enc,
      chargeable_income: null,
      chargeable_income_enc: patch.chargeable_income_enc,
      total_deductions: null,
      total_deductions_enc: patch.total_deductions_enc,
      donations_deduction: null,
      donations_deduction_enc: patch.donations_deduction_enc,
      reliefs_total: null,
      reliefs_total_enc: patch.reliefs_total_enc,
      tax_payable: null,
      tax_payable_enc: patch.tax_payable_enc,
      reliefs_json: null,
      reliefs_json_enc: patch.reliefs_json_enc,
      bracket_summary_json: null,
      bracket_summary_json_enc: patch.bracket_summary_json_enc,
    })
    expect(decoded.employment_income).toBe(120000)
    expect(decoded.chargeable_income).toBe(110000)
    expect(decoded.tax_payable).toBe(4500)
    expect(decoded.reliefs_json).toEqual(reliefs)
    expect(decoded.bracket_summary_json).toEqual({ brackets: [] })
  })
})

// ─── tax_giro_schedule ──────────────────────────────────────────────────

describe("encodeTaxGiroSchedulePiiPatch + decodeTaxGiroSchedulePii", () => {
  it("round-trips schedule jsonb + amounts", async () => {
    const { encodeTaxGiroSchedulePiiPatch, decodeTaxGiroSchedulePii } =
      await import("@/lib/repos/tax-giro-schedule")
    const schedule = [
      { month: 5, amount: 400 },
      { month: 6, amount: 400 },
    ]
    const patch = encodeTaxGiroSchedulePiiPatch({
      schedule,
      total_payable: 4800,
      outstanding_balance: 4000,
    })
    const decoded = decodeTaxGiroSchedulePii({
      schedule: null,
      schedule_enc: patch.schedule_enc,
      total_payable: null,
      total_payable_enc: patch.total_payable_enc,
      outstanding_balance: null,
      outstanding_balance_enc: patch.outstanding_balance_enc,
    })
    expect(decoded.schedule).toEqual(schedule)
    expect(decoded.total_payable).toBe(4800)
    expect(decoded.outstanding_balance).toBe(4000)
  })
})

// ─── tax_relief_inputs / tax_relief_auto ────────────────────────────────

describe("tax_relief_inputs and tax_relief_auto encoders", () => {
  it("round-trip amount on both relief tables", async () => {
    const { encodeTaxReliefInputsPiiPatch, decodeTaxReliefInputsPii } =
      await import("@/lib/repos/tax-relief-inputs")
    const { encodeTaxReliefAutoPiiPatch, decodeTaxReliefAutoPii } =
      await import("@/lib/repos/tax-relief-auto")
    const inEnc = encodeTaxReliefInputsPiiPatch({ amount: 7000 })
    expect(
      decodeTaxReliefInputsPii({ amount: null, amount_enc: inEnc.amount_enc })
        .amount,
    ).toBe(7000)
    const autoEnc = encodeTaxReliefAutoPiiPatch({ amount: 1000 })
    expect(
      decodeTaxReliefAutoPii({ amount: null, amount_enc: autoEnc.amount_enc })
        .amount,
    ).toBe(1000)
  })

  it("AAD isolates the two relief tables (cross-decrypt fails)", async () => {
    const { encodeTaxReliefInputsPiiPatch } = await import(
      "@/lib/repos/tax-relief-inputs"
    )
    const { decryptString } = await import("@/lib/crypto/cipher")
    const enc = encodeTaxReliefInputsPiiPatch({ amount: 500 })
    expect(() =>
      decryptString(enc.amount_enc!, {
        table: "tax_relief_auto",
        column: "amount_enc",
      }),
    ).toThrow()
  })
})

// ─── insurance_policies ─────────────────────────────────────────────────

describe("encodeInsurancePoliciesPiiPatch + decodeInsurancePoliciesPii", () => {
  it("round-trips premium + coverage", async () => {
    const {
      encodeInsurancePoliciesPiiPatch,
      decodeInsurancePoliciesPii,
    } = await import("@/lib/repos/insurance-policies")
    const patch = encodeInsurancePoliciesPiiPatch({
      premium_amount: 1200,
      coverage_amount: 500000,
    })
    const decoded = decodeInsurancePoliciesPii({
      premium_amount: null,
      premium_amount_enc: patch.premium_amount_enc,
      coverage_amount: null,
      coverage_amount_enc: patch.coverage_amount_enc,
    })
    expect(decoded.premium_amount).toBe(1200)
    expect(decoded.coverage_amount).toBe(500000)
  })

  it("coverage_amount can be null (term life w/ no fixed sum)", async () => {
    const { encodeInsurancePoliciesPiiPatch } = await import(
      "@/lib/repos/insurance-policies"
    )
    const patch = encodeInsurancePoliciesPiiPatch({
      premium_amount: 800,
      coverage_amount: null,
    })
    expect(patch.coverage_amount_enc).toBeNull()
    expect(patch.premium_amount_enc).toMatch(/^v1:/)
  })
})

// ─── AAD isolation across Phase 4 tables ────────────────────────────────

describe("AAD isolation across Phase 4 tables", () => {
  it("monthly_cashflow.inflow_enc cannot be decrypted as cpf_balances.oa_enc", async () => {
    const { encodeMonthlyCashflowPiiPatch } = await import(
      "@/lib/repos/monthly-cashflow"
    )
    const { decryptString } = await import("@/lib/crypto/cipher")
    const patch = encodeMonthlyCashflowPiiPatch({ inflow: 5000 })
    expect(() =>
      decryptString(patch.inflow_enc!, {
        table: "cpf_balances",
        column: "oa_enc",
      }),
    ).toThrow()
  })
})
