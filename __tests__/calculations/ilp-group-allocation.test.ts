import { describe, expect, it } from "vitest"
import {
  applySwitchOutZero,
  isValidIlpGroupAllocationSum,
  sumAllocationPcts,
} from "@/lib/investments/ilp-group-allocation"

describe("applySwitchOutZero", () => {
  it("sets one fund to 0 and gives the rest 100% when others had weight", () => {
    const items = [
      { productId: "a", allocationPct: 50 },
      { productId: "b", allocationPct: 50 },
    ]
    const out = applySwitchOutZero(items, "a")
    expect(out.find((x) => x.productId === "a")?.allocationPct).toBe(0)
    expect(out.find((x) => x.productId === "b")?.allocationPct).toBe(100)
    expect(isValidIlpGroupAllocationSum(sumAllocationPcts(out.map((x) => x.allocationPct)))).toBe(
      true,
    )
  })

  it("splits evenly when remaining had zero weight", () => {
    const items = [
      { productId: "a", allocationPct: 100 },
      { productId: "b", allocationPct: 0 },
    ]
    const out = applySwitchOutZero(items, "a")
    expect(out.find((x) => x.productId === "a")?.allocationPct).toBe(0)
    expect(out.find((x) => x.productId === "b")?.allocationPct).toBe(100)
  })
})
