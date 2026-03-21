import { describe, expect, it } from "vitest"
import { deriveMonthlyPremiumsFromGroupTotal } from "@/lib/investments/ilp-premium-derive"

describe("deriveMonthlyPremiumsFromGroupTotal", () => {
  it("splits by allocation and reconciles remainder on last product", () => {
    const m = deriveMonthlyPremiumsFromGroupTotal(100, [
      { productId: "a", allocationPct: 33.33 },
      { productId: "b", allocationPct: 33.33 },
      { productId: "c", allocationPct: 33.34 },
    ])
    const sum = [...m.values()].reduce((s, v) => s + v, 0)
    expect(sum).toBe(100)
    expect(m.get("c")).toBeCloseTo(100 - (m.get("a") ?? 0) - (m.get("b") ?? 0), 2)
  })

  it("single product gets full total", () => {
    const m = deriveMonthlyPremiumsFromGroupTotal(42.5, [
      { productId: "x", allocationPct: 100 },
    ])
    expect(m.get("x")).toBe(42.5)
  })
})
