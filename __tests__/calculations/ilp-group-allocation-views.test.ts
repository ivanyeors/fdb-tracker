import { describe, expect, it } from "vitest"
import {
  allocationModeForGroupSummaryCard,
  groupTopHoldingsSlicesForIlpGroup,
  subtitleForGroupSummaryCard,
} from "@/lib/investments/ilp-group-donut-data"

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
  it("returns category as default mode for summary cards", () => {
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
    expect(allocationModeForGroupSummaryCard(members)).toBe("category")
  })

  it("falls back to category when no holdings data", () => {
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
  it("returns category subtitle for summary cards (default mode)", () => {
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
    expect(subtitleForGroupSummaryCard(members)).toContain("Morningstar category")
  })
})
