import { describe, expect, it } from "vitest"
import {
  allocationSumMessage,
  isValidIlpGroupAllocationSum,
  split100Across,
  sumAllocationPcts,
} from "@/lib/investments/ilp-group-allocation"

describe("sumAllocationPcts", () => {
  it("sums values", () => {
    expect(sumAllocationPcts([33.33, 33.33, 33.34])).toBeCloseTo(100, 2)
    expect(sumAllocationPcts([50, 50])).toBe(100)
  })
})

describe("isValidIlpGroupAllocationSum", () => {
  it("accepts 100 within epsilon", () => {
    expect(isValidIlpGroupAllocationSum(100)).toBe(true)
    expect(isValidIlpGroupAllocationSum(99.995)).toBe(true)
  })
  it("rejects far from 100", () => {
    expect(isValidIlpGroupAllocationSum(99)).toBe(false)
    expect(isValidIlpGroupAllocationSum(101)).toBe(false)
  })
})

describe("allocationSumMessage", () => {
  it("includes sum", () => {
    expect(allocationSumMessage(99.5)).toContain("99.50")
  })
})

describe("split100Across", () => {
  it("returns 100 for one row", () => {
    expect(split100Across(1)).toEqual([100])
  })
  it("splits evenly for small n", () => {
    const s2 = split100Across(2)
    expect(sumAllocationPcts(s2)).toBeCloseTo(100, 2)
    expect(s2).toHaveLength(2)
    const s3 = split100Across(3)
    expect(sumAllocationPcts(s3)).toBeCloseTo(100, 2)
    expect(s3).toHaveLength(3)
  })
})
