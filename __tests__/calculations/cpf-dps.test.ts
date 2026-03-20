import { describe, it, expect } from "vitest"
import { getDpsAnnualPremium, getDpsMonthlyOaDeduction } from "@/lib/calculations/cpf-dps"

describe("cpf-dps", () => {
  it("returns ~18 for age 30", () => {
    expect(getDpsAnnualPremium(30, 2026)).toBe(18)
  })

  it("returns null outside 21–65", () => {
    expect(getDpsAnnualPremium(20, 2026)).toBeNull()
    expect(getDpsAnnualPremium(66, 2026)).toBeNull()
  })

  it("getDpsMonthlyOaDeduction spreads annual / 12 when included", () => {
    const m = getDpsMonthlyOaDeduction(1996, 2026, true)
    expect(m).toBeCloseTo(18 / 12, 2)
  })

  it("getDpsMonthlyOaDeduction is zero when excluded", () => {
    expect(getDpsMonthlyOaDeduction(1996, 2026, false)).toBe(0)
  })
})
