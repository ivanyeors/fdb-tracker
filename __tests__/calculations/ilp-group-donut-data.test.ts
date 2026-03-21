import { describe, expect, it } from "vitest"
import {
  allocationSlicesForIlpGroup,
  groupUsesCategoryBuckets,
} from "@/lib/investments/ilp-group-donut-data"

describe("allocationSlicesForIlpGroup", () => {
  it("buckets by fund name when no snapshot category", () => {
    const rows = allocationSlicesForIlpGroup([
      { name: "A", fundValue: 30, fundReportSnapshot: null },
      { name: "B", fundValue: 70, fundReportSnapshot: null },
    ])
    expect(rows).toHaveLength(2)
    const a = rows.find((r) => r.name === "A")
    expect(a?.percentage).toBeCloseTo(30, 5)
  })

  it("merges funds that share the same Morningstar category in snapshot header", () => {
    const snap = {
      version: 1,
      header: { "Morningstar Category": "Japan Equity" },
    } as Record<string, unknown>
    const rows = allocationSlicesForIlpGroup([
      { name: "F1", fundValue: 40, fundReportSnapshot: snap },
      { name: "F2", fundValue: 60, fundReportSnapshot: snap },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe("Japan Equity")
    expect(rows[0].value).toBe(100)
  })
})

describe("groupUsesCategoryBuckets", () => {
  it("is true when any member has category", () => {
    expect(
      groupUsesCategoryBuckets([
        {
          name: "F1",
          fundValue: 1,
          fundReportSnapshot: {
            version: 1,
            header: { "Morningstar Category": "X" },
          } as Record<string, unknown>,
        },
      ])
    ).toBe(true)
  })
})
