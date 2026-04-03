import {
  getMslAnnualPremium,
  getAnnualHealthcareMaDeduction,
  getMonthlyHealthcareMaDeduction,
  type CpfHealthcareConfig,
} from "@/lib/calculations/cpf-healthcare"

describe("getMslAnnualPremium", () => {
  it("returns $295 for age 25 (age-next-birthday 26, band 21-30)", () => {
    expect(getMslAnnualPremium(25)).toBe(295)
  })

  it("returns $503 for age 31 (age-next-birthday 32, band 31-40)", () => {
    expect(getMslAnnualPremium(31)).toBe(503)
  })

  it("returns $200 for age 10 (age-next-birthday 11, band 1-20)", () => {
    expect(getMslAnnualPremium(10)).toBe(200)
  })

  it("returns $903 for age 55 (age-next-birthday 56, band 51-60)", () => {
    expect(getMslAnnualPremium(55)).toBe(903)
  })

  it("returns highest band for age 95 (age-next-birthday 96)", () => {
    expect(getMslAnnualPremium(95)).toBe(2826)
  })
})

describe("getAnnualHealthcareMaDeduction", () => {
  it("returns MSL-only estimate when config is null", () => {
    const result = getAnnualHealthcareMaDeduction(32, null)
    expect(result.msl).toBe(503)
    expect(result.csl).toBe(0)
    expect(result.sup).toBe(0)
    expect(result.pmi).toBe(0)
    expect(result.total).toBe(503)
  })

  it("uses config overrides when provided", () => {
    const config: CpfHealthcareConfig = {
      profileId: "test",
      mslAnnualOverride: 429,
      cslAnnual: 232.88,
      cslSupplementAnnual: 600,
      ispAnnual: 300,
    }
    const result = getAnnualHealthcareMaDeduction(32, config)
    expect(result.msl).toBe(429)
    expect(result.csl).toBe(232.88)
    expect(result.sup).toBe(600)
    expect(result.pmi).toBe(300)
    expect(result.total).toBe(1561.88)
  })

  it("uses age-based MSL when override is null", () => {
    const config: CpfHealthcareConfig = {
      profileId: "test",
      mslAnnualOverride: null,
      cslAnnual: 200,
      cslSupplementAnnual: 0,
      ispAnnual: 0,
    }
    const result = getAnnualHealthcareMaDeduction(32, config)
    expect(result.msl).toBe(503) // age 32 → band 31-40
    expect(result.total).toBe(703)
  })
})

describe("getMonthlyHealthcareMaDeduction", () => {
  it("spreads annual total evenly across 12 months", () => {
    // birth_year 1993, calendar year 2025 → age 32
    const monthly = getMonthlyHealthcareMaDeduction(1993, 2025, null)
    // MSL for age 32 = $503/yr → $41.92/mo
    expect(monthly).toBe(41.92)
  })

  it("uses config values for monthly calculation", () => {
    const config: CpfHealthcareConfig = {
      profileId: "test",
      mslAnnualOverride: 429,
      cslAnnual: 232.88,
      cslSupplementAnnual: 600,
      ispAnnual: 300,
    }
    // $1561.88 / 12 = $130.16
    const monthly = getMonthlyHealthcareMaDeduction(1993, 2025, config)
    expect(monthly).toBe(130.16)
  })
})

describe("PDF statement validation", () => {
  // Validate against actual 2025 CPF statement for person born 1993
  it("matches statement healthcare outflow total of $1,561.88", () => {
    const config: CpfHealthcareConfig = {
      profileId: "statement-person",
      mslAnnualOverride: 429, // actual MSL from statement
      cslAnnual: 232.88, // actual CSL from statement
      cslSupplementAnnual: 600, // actual SUP from statement
      ispAnnual: 300, // actual PMI from statement
    }
    const result = getAnnualHealthcareMaDeduction(32, config)
    expect(result.total).toBe(1561.88)
  })
})
