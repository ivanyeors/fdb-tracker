import { describe, it, expect } from "vitest"
import {
  loanMonthlyPayment,
  estimateOutstandingPrincipal,
  splitPayment,
} from "@/lib/calculations/loans"

describe("loans", () => {
  it("loanMonthlyPayment matches standard amortization", () => {
    const pmt = loanMonthlyPayment(500_000, 2.6, 300)
    expect(pmt).toBeGreaterThan(2200)
    expect(pmt).toBeLessThan(2400)
  })

  it("estimateOutstandingPrincipal reduces with repayments", () => {
    const principal = 100_000
    const rate = 2.6
    const repayments = [{ amount: 2000, date: "2025-02-01" }]
    const bal = estimateOutstandingPrincipal(principal, rate, repayments, [])
    expect(bal).toBeLessThan(principal)
    expect(bal).toBeGreaterThan(0)
  })

  it("splitPayment allocates interest first", () => {
    const { interest, principal } = splitPayment(100_000, 2.6, 2000)
    expect(interest).toBeCloseTo(216.67, 1)
    expect(principal).toBeCloseTo(2000 - interest, 2)
  })
})
