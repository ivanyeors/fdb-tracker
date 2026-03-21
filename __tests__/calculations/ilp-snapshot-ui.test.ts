import { describe, expect, it } from "vitest"
import {
  annualPerformanceToSeries,
  assetAllocationToCategoryDonutRows,
  parsePercentCell,
} from "@/lib/investments/ilp-snapshot-ui"

describe("parsePercentCell", () => {
  it("parses plain percentages", () => {
    expect(parsePercentCell("12.34%")).toBeCloseTo(12.34, 4)
    expect(parsePercentCell("−5.2%")).toBeCloseTo(-5.2, 4)
  })

  it("handles unicode minus and commas", () => {
    expect(parsePercentCell("\u221210.5%")).toBeCloseTo(-10.5, 4)
    expect(parsePercentCell("1,234.5%")).toBeCloseTo(1234.5, 4)
  })

  it("returns null for empty or dash", () => {
    expect(parsePercentCell(null)).toBeNull()
    expect(parsePercentCell("—")).toBeNull()
    expect(parsePercentCell("")).toBeNull()
  })
})

describe("assetAllocationToCategoryDonutRows", () => {
  it("builds slices from positive category percentages", () => {
    const rows = assetAllocationToCategoryDonutRows([
      { label: "Stocks", weightPct: 90, categoryPct: 93.73 },
      { label: "Cash", weightPct: 10, categoryPct: 7.47 },
    ])
    expect(rows.length).toBeGreaterThan(0)
    const sum = rows.reduce((s, r) => s + r.value, 0)
    expect(sum).toBeCloseTo(101.2, 1)
  })
})

describe("annualPerformanceToSeries", () => {
  it("aligns labels with fund values", () => {
    const s = annualPerformanceToSeries({
      periodLabels: ["1Y", "3Y"],
      fundValues: ["10.5%", "−2.0%"],
    })
    expect(s).toHaveLength(2)
    expect(s[0]).toEqual({ period: "1Y", value: 10.5 })
    expect(s[1]).toEqual({ period: "3Y", value: -2 })
  })

  it("skips unparseable cells", () => {
    const s = annualPerformanceToSeries({
      periodLabels: ["A", "B"],
      fundValues: ["—", "5%"],
    })
    expect(s).toHaveLength(1)
    expect(s[0].period).toBe("B")
  })
})
