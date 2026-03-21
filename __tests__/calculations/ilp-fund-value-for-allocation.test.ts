import { describe, expect, it } from "vitest"
import { fundValueForAllocation } from "@/lib/investments/ilp-fund-value-for-allocation"

describe("fundValueForAllocation", () => {
  it("returns latest when latest > 0", () => {
    expect(
      fundValueForAllocation(
        { fund_value: 100 },
        [
          { month: "2024-01-01", fund_value: 50 },
          { month: "2024-02-01", fund_value: 100 },
        ],
      ),
    ).toBe(100)
  })

  it("falls back to most recent month with positive value when latest is 0", () => {
    expect(
      fundValueForAllocation(
        { fund_value: 0 },
        [
          { month: "2024-01-01", fund_value: 1000 },
          { month: "2024-02-01", fund_value: 28695.66 },
          { month: "2024-03-01", fund_value: 0 },
        ],
      ),
    ).toBeCloseTo(28695.66, 5)
  })

  it("returns 0 when all entries are zero or missing", () => {
    expect(
      fundValueForAllocation(
        { fund_value: 0 },
        [
          { month: "2024-01-01", fund_value: 0 },
          { month: "2024-02-01", fund_value: 0 },
        ],
      ),
    ).toBe(0)
    expect(fundValueForAllocation(null, [])).toBe(0)
  })

  it("coerces string fund_value from JSON", () => {
    expect(
      fundValueForAllocation(
        { fund_value: "123.45" as unknown as number },
        [],
      ),
    ).toBeCloseTo(123.45, 5)
  })
})
