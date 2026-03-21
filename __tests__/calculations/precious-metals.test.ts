import { describe, expect, it } from "vitest"
import {
  valuateGold,
  valuatePreciousMetalOz,
  valuateSilver,
} from "@/lib/calculations/precious-metals"

describe("valuatePreciousMetalOz", () => {
  it("values at sell price and computes P&L", () => {
    const v = valuatePreciousMetalOz({
      unitsOz: 2,
      sellPriceSgdPerOz: 100,
      buyPriceSgdPerOz: 102,
      totalCostBasisSgd: 180,
    })
    expect(v.currentValueSgd).toBe(200)
    expect(v.buyPriceSgdPerOz).toBe(102)
    expect(v.sellPriceSgdPerOz).toBe(100)
    expect(v.pnlSgd).toBe(20)
    expect(v.pnlPct).toBeCloseTo((20 / 180) * 100, 5)
  })

  it("uses sell as buy display price when buy is null", () => {
    const v = valuatePreciousMetalOz({
      unitsOz: 1,
      sellPriceSgdPerOz: 50,
      buyPriceSgdPerOz: null,
      totalCostBasisSgd: 40,
    })
    expect(v.buyPriceSgdPerOz).toBe(50)
    expect(v.currentValueSgd).toBe(50)
    expect(v.pnlSgd).toBe(10)
  })

  it("pnlPct is 0 when cost basis is 0", () => {
    const v = valuatePreciousMetalOz({
      unitsOz: 1,
      sellPriceSgdPerOz: 10,
      buyPriceSgdPerOz: 10,
      totalCostBasisSgd: 0,
    })
    expect(v.pnlPct).toBe(0)
  })
})

describe("valuateGold / valuateSilver", () => {
  it("delegates to shared logic", () => {
    const g = valuateGold(1, 3000, 2900, 3100)
    const s = valuateSilver(1, 30, 28, 31)
    expect(g.currentValueSgd).toBe(3000)
    expect(g.pnlSgd).toBe(100)
    expect(s.currentValueSgd).toBe(30)
    expect(s.pnlSgd).toBe(2)
  })
})
