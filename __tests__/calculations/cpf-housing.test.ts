import { describe, it, expect } from "vitest"
import {
  accruedInterestForTranche,
  aggregateHousingUsage,
  vlHeadroom120,
  wholeMonthsForAccrual,
} from "@/lib/calculations/cpf-housing"

describe("cpf-housing", () => {
  it("wholeMonthsForAccrual counts calendar months between month starts", () => {
    expect(wholeMonthsForAccrual("2020-01-15", "2020-01-31")).toBe(0)
    expect(wholeMonthsForAccrual("2020-01-01", "2025-01-01")).toBe(60)
  })

  it("accruedInterestForTranche uses 2.5% compounded monthly", () => {
    const p = 200_000
    const months = wholeMonthsForAccrual("2015-03-01", "2025-03-01")
    expect(months).toBe(120)
    const accrued = accruedInterestForTranche(p, "2015-03-01", "2025-03-01")
    const m = 0.025 / 12
    const expected = p * (Math.pow(1 + m, 120) - 1)
    expect(accrued).toBeCloseTo(Math.round(expected * 100) / 100, 1)
    expect(accrued).toBeGreaterThan(56_000)
    expect(accrued).toBeLessThan(58_000)
  })

  it("aggregateHousingUsage sums principals and accrued", () => {
    const asOf = "2024-06-01"
    const agg = aggregateHousingUsage(
      [
        { principalWithdrawn: 100_000, withdrawalDate: "2020-01-01" },
        { principalWithdrawn: 50_000, withdrawalDate: "2022-01-01" },
      ],
      asOf,
    )
    expect(agg.totalPrincipal).toBe(150_000)
    expect(agg.refundDue).toBeCloseTo(agg.totalPrincipal + agg.totalAccruedInterest, 0)
  })

  it("vlHeadroom120 returns null without valuation limit", () => {
    expect(vlHeadroom120(null, 100_000)).toBeNull()
    expect(vlHeadroom120(undefined, 100_000)).toBeNull()
  })

  it("vlHeadroom120 subtracts CPF principal used from 120% cap", () => {
    expect(vlHeadroom120(500_000, 400_000)).toBe(200_000)
    expect(vlHeadroom120(500_000, 700_000)).toBe(0)
  })
})
