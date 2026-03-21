import { describe, expect, it } from "vitest"
import {
  allocationModeForGroupSummaryCard,
  blendedFundMixSlicesForIlpGroup,
  groupSectorSlicesFromHoldings,
  groupTopHoldingsSlicesForIlpGroup,
  subtitleForGroupSummaryCard,
} from "@/lib/investments/ilp-group-donut-data"

describe("blendedFundMixSlicesForIlpGroup", () => {
  it("weights asset allocation rows by fund value", () => {
    const rows = blendedFundMixSlicesForIlpGroup([
      {
        name: "A",
        fundValue: 1000,
        fundReportSnapshot: {
          version: 1,
          header: {},
          assetAllocation: [
            { label: "Stocks", weightPct: 50, categoryPct: null },
            { label: "Cash", weightPct: 50, categoryPct: null },
          ],
        } as Record<string, unknown>,
      },
      {
        name: "B",
        fundValue: 1000,
        fundReportSnapshot: {
          version: 1,
          header: {},
          assetAllocation: [
            { label: "Stocks", weightPct: 80, categoryPct: null },
            { label: "Bonds", weightPct: 20, categoryPct: null },
          ],
        } as Record<string, unknown>,
      },
    ])
    expect(rows).not.toBeNull()
    const stocks = rows!.find((r) => r.name === "Stocks")
    const cash = rows!.find((r) => r.name === "Cash")
    const bonds = rows!.find((r) => r.name === "Bonds")
    expect(stocks?.value).toBeCloseTo(500 + 800, 5)
    expect(cash?.value).toBeCloseTo(500, 5)
    expect(bonds?.value).toBeCloseTo(200, 5)
  })
})

describe("groupTopHoldingsSlicesForIlpGroup", () => {
  it("accepts string weightPct from JSON", () => {
    const rows = groupTopHoldingsSlicesForIlpGroup(
      [
        {
          name: "F1",
          fundValue: 1000,
          fundReportSnapshot: {
            version: 1,
            header: {},
            topHoldings: [
              {
                rank: 1,
                securityName: "Acme Corp",
                sector: "Tech",
                country: "US",
                weightPct: "9.08" as unknown as number,
              },
            ],
          } as Record<string, unknown>,
        },
      ],
      { topN: 10, otherLabel: "Other" },
    )
    expect(rows).not.toBeNull()
    const acme = rows!.find((r) => r.name === "Acme Corp")
    expect(acme?.value).toBeCloseTo(90.8, 5)
  })

  it("merges same security across funds and caps top N + Other", () => {
    const rows = groupTopHoldingsSlicesForIlpGroup(
      [
        {
          name: "F1",
          fundValue: 1000,
          fundReportSnapshot: {
            version: 1,
            header: {},
            topHoldings: [
              {
                rank: 1,
                securityName: "Acme Corp",
                sector: "Tech",
                country: "US",
                weightPct: 10,
              },
            ],
          } as Record<string, unknown>,
        },
        {
          name: "F2",
          fundValue: 1000,
          fundReportSnapshot: {
            version: 1,
            header: {},
            topHoldings: [
              {
                rank: 1,
                securityName: "Acme Corp",
                sector: "Tech",
                country: "US",
                weightPct: 5,
              },
            ],
          } as Record<string, unknown>,
        },
      ],
      { topN: 1, otherLabel: "Other" },
    )
    expect(rows).not.toBeNull()
    const acme = rows!.find((r) => r.name === "Acme Corp")
    expect(acme?.value).toBeCloseTo(150, 5)
    const other = rows!.find((r) => r.name === "Other")
    expect(other).toBeUndefined()
  })
})

describe("allocationModeForGroupSummaryCard", () => {
  it("returns holdings when merged top-holdings slices exist", () => {
    const members = [
      {
        name: "F1",
        fundValue: 1000,
        fundReportSnapshot: {
          version: 1,
          header: {},
          topHoldings: [
            {
              rank: 1,
              securityName: "Acme Corp",
              sector: "Tech",
              country: "US",
              weightPct: 10,
            },
          ],
        } as Record<string, unknown>,
      },
    ]
    expect(allocationModeForGroupSummaryCard(members)).toBe("holdings")
  })

  it("falls back to category when no holdings or blend data", () => {
    const members = [
      {
        name: "F1",
        fundValue: 100,
        fundReportSnapshot: { version: 1, header: {} } as Record<string, unknown>,
      },
    ]
    expect(allocationModeForGroupSummaryCard(members)).toBe("category")
  })
})

describe("subtitleForGroupSummaryCard", () => {
  it("mentions merged companies when mode is holdings", () => {
    const members = [
      {
        name: "F1",
        fundValue: 1000,
        fundReportSnapshot: {
          version: 1,
          header: {},
          topHoldings: [
            {
              rank: 1,
              securityName: "Acme Corp",
              sector: null,
              country: null,
              weightPct: 100,
            },
          ],
        } as Record<string, unknown>,
      },
    ]
    expect(subtitleForGroupSummaryCard(members)).toContain("Merged by company")
  })
})

describe("groupSectorSlicesFromHoldings", () => {
  it("buckets by sector and sends missing sector to Unclassified", () => {
    const rows = groupSectorSlicesFromHoldings(
      [
        {
          name: "F1",
          fundValue: 1000,
          fundReportSnapshot: {
            version: 1,
            header: {},
            topHoldings: [
              {
                rank: 1,
                securityName: "A",
                sector: "Technology",
                country: null,
                weightPct: 40,
              },
              {
                rank: 2,
                securityName: "B",
                sector: null,
                country: null,
                weightPct: 10,
              },
            ],
          } as Record<string, unknown>,
        },
      ],
      { topN: 10, unclassifiedLabel: "Unclassified" },
    )
    expect(rows).not.toBeNull()
    const tech = rows!.find((r) => r.name === "Technology")
    const uncl = rows!.find((r) => r.name === "Unclassified")
    expect(tech?.value).toBeCloseTo(400, 5)
    expect(uncl?.value).toBeCloseTo(100, 5)
  })
})
