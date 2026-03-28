import { sumLoanMonthlyPayments } from "@/lib/api/cashflow-aggregation"

describe("sumLoanMonthlyPayments", () => {
  it("returns 0 for null or empty array", () => {
    expect(sumLoanMonthlyPayments(null)).toBe(0)
    expect(sumLoanMonthlyPayments([])).toBe(0)
  })

  it("calculates monthly payment for a cash loan", () => {
    const result = sumLoanMonthlyPayments([
      { principal: 300000, rate_pct: 2.6, tenure_months: 300 },
    ])
    // Standard amortization: ~$1,358/mo for $300k at 2.6% over 25yr
    expect(result).toBeGreaterThan(1300)
    expect(result).toBeLessThan(1400)
  })

  it("excludes CPF OA loans from cash outflow", () => {
    const result = sumLoanMonthlyPayments([
      { principal: 300000, rate_pct: 2.6, tenure_months: 300, use_cpf_oa: true },
    ])
    expect(result).toBe(0)
  })

  it("only sums cash loans when mixed with CPF OA loans", () => {
    const cashOnly = sumLoanMonthlyPayments([
      { principal: 50000, rate_pct: 3.0, tenure_months: 60 },
    ])
    const mixed = sumLoanMonthlyPayments([
      { principal: 50000, rate_pct: 3.0, tenure_months: 60 },
      { principal: 300000, rate_pct: 2.6, tenure_months: 300, use_cpf_oa: true },
    ])
    expect(mixed).toBe(cashOnly)
  })

  it("treats use_cpf_oa=false same as undefined", () => {
    const a = sumLoanMonthlyPayments([
      { principal: 100000, rate_pct: 2.0, tenure_months: 120 },
    ])
    const b = sumLoanMonthlyPayments([
      { principal: 100000, rate_pct: 2.0, tenure_months: 120, use_cpf_oa: false },
    ])
    expect(a).toBe(b)
  })

  it("handles 0% rate loan", () => {
    const result = sumLoanMonthlyPayments([
      { principal: 12000, rate_pct: 0, tenure_months: 12 },
    ])
    expect(result).toBe(1000)
  })
})
