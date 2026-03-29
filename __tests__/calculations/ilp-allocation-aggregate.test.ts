import { describe, expect, it } from "vitest"
import {
  allocationByIlpGroupOrStandalone,
  allocationByIlpProductWithGroupLabel,
} from "@/lib/investments/ilp-allocation-aggregate"

describe("allocationByIlpGroupOrStandalone", () => {
  it("merges two products in the same group into one slice", () => {
    const rows = allocationByIlpGroupOrStandalone([
      {
        name: "Fund A",
        latestEntry: { fund_value: 40 },
        fund_group_memberships: [{ group_id: "g1", group_name: "My Group" }],
      },
      {
        name: "Fund B",
        latestEntry: { fund_value: 60 },
        fund_group_memberships: [{ group_id: "g1", group_name: "My Group" }],
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
        fund_group_memberships: [],
      },
      {
        name: "Other",
        latestEntry: { fund_value: 70 },
        fund_group_memberships: undefined,
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
        fund_group_memberships: [],
      },
      {
        name: "Y",
        latestEntry: null,
        fund_group_memberships: [],
      },
    ])
    expect(rows).toHaveLength(0)
  })

  it("sorts by value descending", () => {
    const rows = allocationByIlpGroupOrStandalone([
      {
        name: "Small",
        latestEntry: { fund_value: 10 },
        fund_group_memberships: [],
      },
      {
        name: "Big",
        latestEntry: { fund_value: 90 },
        fund_group_memberships: [],
      },
    ])
    expect(rows[0].name).toBe("Big")
    expect(rows[1].name).toBe("Small")
  })

  it("allocationByIlpProductWithGroupLabel: one slice per fund with Group · Fund labels", () => {
    const rows = allocationByIlpProductWithGroupLabel([
      {
        name: "Fund A",
        latestEntry: { fund_value: 40 },
        fund_group_memberships: [{ group_id: "g1", group_name: "AIA PRE" }],
      },
      {
        name: "Fund B",
        latestEntry: { fund_value: 60 },
        fund_group_memberships: [{ group_id: "g1", group_name: "AIA PRE" }],
      },
    ])
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.name).sort()).toEqual([
      "AIA PRE · Fund A",
      "AIA PRE · Fund B",
    ])
    expect(rows.find((r) => r.name === "AIA PRE · Fund B")?.percentage).toBeCloseTo(
      60,
      5,
    )
  })

  it("disambiguates duplicate display titles from different groups", () => {
    const rows = allocationByIlpGroupOrStandalone([
      {
        name: "A",
        latestEntry: { fund_value: 40 },
        fund_group_memberships: [{ group_id: "g1", group_name: "Same" }],
      },
      {
        name: "B",
        latestEntry: { fund_value: 60 },
        fund_group_memberships: [{ group_id: "g2", group_name: "Same" }],
      },
    ])
    expect(rows).toHaveLength(2)
    const names = rows.map((r) => r.name).sort()
    expect(names).toEqual(["Same", "Same (2)"])
  })
})
