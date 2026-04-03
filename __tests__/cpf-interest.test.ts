import {
  estimateAnnualInterest,
  calculateAnnualInterest,
  deriveInterestFromDeltas,
} from "@/lib/calculations/cpf-interest"

describe("estimateAnnualInterest", () => {
  it("calculates base interest correctly for typical balances", () => {
    // OA: $89,976.08 × 2.5% = $2,249.40
    // SA: $39,630.46 × 4% = $1,585.22
    // MA: $37,899.62 × 4% = $1,515.98
    const result = estimateAnnualInterest(89976.08, 39630.46, 37899.62, 32)
    expect(result.oaBase).toBe(2249.4)
    expect(result.saBase).toBe(1585.22)
    expect(result.maBase).toBe(1515.98)
  })

  it("includes extra interest on first $60k (first $20k from OA)", () => {
    const result = estimateAnnualInterest(89976.08, 39630.46, 37899.62, 32)
    // Extra: $20k OA + $39,630.46 SA + $370.54 MA (to fill $60k cap) = $60k
    // Extra interest: $60,000 × 1% = $600
    expect(result.extraInterest).toBe(600)
  })

  it("returns total of all interest components", () => {
    const result = estimateAnnualInterest(89976.08, 39630.46, 37899.62, 32)
    expect(result.total).toBe(
      result.oaBase + result.saBase + result.maBase + result.extraInterest,
    )
  })

  it("adds bonus interest for age >= 55", () => {
    const under55 = estimateAnnualInterest(50000, 50000, 50000, 50)
    const over55 = estimateAnnualInterest(50000, 50000, 50000, 55)
    expect(over55.extraInterest).toBeGreaterThan(under55.extraInterest)
  })
})

describe("calculateAnnualInterest (CPF actual method)", () => {
  it("returns zero for empty balances", () => {
    const result = calculateAnnualInterest([], 32)
    expect(result.total).toBe(0)
  })

  it("matches estimate for constant monthly balances", () => {
    // If balances are constant, sum / 12 = balance, so result ≈ estimate
    const constant = Array.from({ length: 12 }, () => ({
      oa: 50000,
      sa: 30000,
      ma: 20000,
    }))
    const result = calculateAnnualInterest(constant, 32)
    const estimate = estimateAnnualInterest(50000, 30000, 20000, 32)
    expect(result.oaBase).toBe(estimate.oaBase)
    expect(result.saBase).toBe(estimate.saBase)
    expect(result.maBase).toBe(estimate.maBase)
  })
})

describe("deriveInterestFromDeltas", () => {
  it("derives interest from balance changes", () => {
    // PDF data: start $136,763.99, end $167,506.16
    // Contributions: $26,948.00 (employee + employer, excluding interest)
    // Outflows: $1,579.88
    // Interest = (167506.16 - 136763.99) - 26948.00 + 1579.88 = 5374.05
    const interest = deriveInterestFromDeltas(
      { oa: 71257.95, sa: 33292.76, ma: 32213.28 },
      { oa: 89976.08, sa: 39630.46, ma: 37899.62 },
      26948.0,
      1579.88,
    )
    expect(interest).toBeCloseTo(5374.05, 1)
  })
})
