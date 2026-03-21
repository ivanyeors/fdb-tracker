import { describe, expect, it } from "vitest"
import {
  formatMoneyFromSgd,
  sgdToDisplayAmount,
} from "@/lib/investments/display-currency"

describe("sgdToDisplayAmount", () => {
  it("returns SGD unchanged in SGD mode", () => {
    expect(sgdToDisplayAmount(100, "SGD", 1.35)).toBe(100)
  })

  it("converts to USD using sgdPerUsd", () => {
    expect(sgdToDisplayAmount(135, "USD", 1.35)).toBe(100)
  })

  it("falls back to SGD amount when USD requested but rate missing", () => {
    expect(sgdToDisplayAmount(135, "USD", null)).toBe(135)
  })
})

describe("formatMoneyFromSgd", () => {
  it("formats SGD with S$ prefix", () => {
    expect(formatMoneyFromSgd(100, "SGD", 1.35)).toBe("S$100.00")
  })

  it("formats USD with US$ prefix when rate present", () => {
    expect(formatMoneyFromSgd(135, "USD", 1.35)).toBe("US$100.00")
  })

  it("falls back to S$ when USD requested but rate missing", () => {
    expect(formatMoneyFromSgd(100, "USD", null)).toMatch(/^S\$100\.00$/)
  })
})
