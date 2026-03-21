import { describe, expect, it } from "vitest"
import {
  aggregateLotsToHolding,
  groupHoldings,
  holdingGroupKey,
} from "@/lib/investments/group-holdings"
import type { Holding } from "@/lib/investments/holding"

function h(partial: Partial<Holding> & Pick<Holding, "symbol" | "type" | "units">): Holding {
  return {
    id: partial.id ?? "id-1",
    symbol: partial.symbol,
    type: partial.type,
    units: partial.units,
    costPerUnit: partial.costPerUnit ?? 1,
    costBasis: partial.costBasis ?? partial.units * (partial.costPerUnit ?? 1),
    currentPrice: partial.currentPrice ?? null,
    currentValue: partial.currentValue ?? null,
    pnl: partial.pnl ?? null,
    pnlPct: partial.pnlPct ?? null,
    portfolioPct: partial.portfolioPct ?? 0,
    createdAt: partial.createdAt,
  }
}

describe("holdingGroupKey", () => {
  it("normalizes case and type", () => {
    expect(holdingGroupKey("aapl", "stock")).toBe("stock::AAPL")
    expect(holdingGroupKey(" AAPL ", "STOCK")).toBe("stock::AAPL")
  })
})

describe("aggregateLotsToHolding", () => {
  it("sums units and cost basis", () => {
    const lots = [
      h({
        id: "a",
        symbol: "VOO",
        type: "etf",
        units: 10,
        costPerUnit: 100,
        costBasis: 1000,
        currentValue: 1100,
        pnl: 100,
        pnlPct: 10,
      }),
      h({
        id: "b",
        symbol: "VOO",
        type: "etf",
        units: 5,
        costPerUnit: 110,
        costBasis: 550,
        currentValue: 550,
        pnl: 0,
        pnlPct: 0,
      }),
    ]
    const g = aggregateLotsToHolding(lots)
    expect(g.units).toBe(15)
    expect(g.costBasis).toBe(1550)
    expect(g.costPerUnit).toBeCloseTo(1550 / 15, 5)
    expect(g.currentValue).toBe(1650)
    expect(g.pnl).toBe(100)
    expect(g.pnlPct).toBeCloseTo((100 / 1550) * 100, 5)
    expect(g.currentPrice).toBeCloseTo(1650 / 15, 5)
    expect(g.symbol).toBe("VOO")
  })

  it("returns null currentValue when no lot has live value", () => {
    const lots = [
      h({
        symbol: "X",
        type: "stock",
        units: 1,
        costBasis: 10,
        currentValue: null,
        pnl: null,
      }),
    ]
    const g = aggregateLotsToHolding(lots)
    expect(g.currentValue).toBeNull()
    expect(g.pnl).toBeNull()
  })
})

describe("groupHoldings", () => {
  it("produces one summary per symbol+type", () => {
    const rows: Holding[] = [
      h({
        id: "1",
        symbol: "AAPL",
        type: "stock",
        units: 1,
        costBasis: 100,
        currentValue: 120,
        pnl: 20,
      }),
      h({
        id: "2",
        symbol: "MSFT",
        type: "stock",
        units: 2,
        costBasis: 200,
        currentValue: 220,
        pnl: 20,
      }),
      h({
        id: "3",
        symbol: "aapl",
        type: "stock",
        units: 1,
        costBasis: 100,
        currentValue: 120,
        pnl: 20,
      }),
    ]
    const groups = groupHoldings(rows)
    expect(groups).toHaveLength(2)
    const aapl = groups.find((g) => g.summary.symbol.toUpperCase() === "AAPL")
    expect(aapl?.lots).toHaveLength(2)
    expect(aapl?.summary.units).toBe(2)
    expect(aapl?.summary.costBasis).toBe(200)
  })
})
