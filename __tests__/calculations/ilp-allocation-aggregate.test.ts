import { describe, expect, it } from "vitest"
import { allocationByIlpGroupOrStandalone } from "@/lib/investments/ilp-allocation-aggregate"

describe("allocationByIlpGroupOrStandalone", () => {
  it("merges two products in the same group into one slice", () => {
    const rows = allocationByIlpGroupOrStandalone([
      {
        name: "Fund A",
        latestEntry: { fund_value: 40 },
        ilp_fund_groups: { id: "g1", name: "My Group" },
      },
      {
        name: "Fund B",
        latestEntry: { fund_value: 60 },
        ilp_fund_groups: { id: "g1", name: "My Group" },
      },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: "My Group",
      value: 100,
      percentage: 100,
    })
  })

  it("keeps standalone products as separate slices", () => {
    const rows = allocationByIlpGroupOrStandalone([
      {
        name: "Solo",
        latestEntry: { fund_value: 30 },
        ilp_fund_groups: null,
      },
      {
        name: "Other",
        latestEntry: { fund_value: 70 },
        ilp_fund_groups: undefined,
      },
    ])
    expect(rows).toHaveLength(2)
    const solo = rows.find((r) => r.name === "Solo")
    const other = rows.find((r) => r.name === "Other")
    expect(solo?.percentage).toBeCloseTo(30, 5)
    expect(other?.percentage).toBeCloseTo(70, 5)
  })

  it("ignores zero or missing fund values", () => {
    const rows = allocationByIlpGroupOrStandalone([
      {
        name: "X",
        latestEntry: { fund_value: 0 },
        ilp_fund_groups: null,
      },
      {
        name: "Y",
        latestEntry: null,
        ilp_fund_groups: null,
      },
    ])
    expect(rows).toHaveLength(0)
  })

  it("sorts by value descending", () => {
    const rows = allocationByIlpGroupOrStandalone([
      {
        name: "Small",
        latestEntry: { fund_value: 10 },
        ilp_fund_groups: null,
      },
      {
        name: "Big",
        latestEntry: { fund_value: 90 },
        ilp_fund_groups: null,
      },
    ])
    expect(rows[0].name).toBe("Big")
    expect(rows[1].name).toBe("Small")
  })
})
