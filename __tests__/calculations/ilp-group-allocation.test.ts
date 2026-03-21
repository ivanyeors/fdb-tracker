import { describe, expect, it } from "vitest"
import {
  applySwitchOutZero,
  isValidIlpGroupAllocationSum,
  mergeMultiGroupAllocationItems,
  sumAllocationPcts,
} from "@/lib/investments/ilp-group-allocation"

describe("mergeMultiGroupAllocationItems", () => {
  it("merges e: and n: when the same product id appears in members and file rows", () => {
    const members = [{ id: "a", name: "Fund A" }]
    const newIds = ["a"]
    const pct = { "e:a": 40, "n:0": 60 }
    const out = mergeMultiGroupAllocationItems(members, newIds, pct)
    expect(out).toEqual([{ productId: "a", allocationPct: 100 }])
    expect(isValidIlpGroupAllocationSum(sumAllocationPcts(out.map((x) => x.allocationPct)))).toBe(
      true,
    )
  })

  it("returns one row per product when file rows map to distinct policies", () => {
    const members: { id: string; name: string }[] = []
    const newIds = ["x", "y"]
    const pct = { "n:0": 50, "n:1": 50 }
    const out = mergeMultiGroupAllocationItems(members, newIds, pct)
    expect(out).toHaveLength(2)
    expect(isValidIlpGroupAllocationSum(sumAllocationPcts(out.map((x) => x.allocationPct)))).toBe(
      true,
    )
  })
})

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
