import { describe, expect, it } from "vitest"
import {
  chargeableIncomeInLayer,
  countedManualReliefForType,
  getResidentBracketChartLayers,
  previewChargeableAfterExtraCountedRelief,
  resolveTaxBracketChartAxisMaxDollars,
  taxDeltaFromLowerChargeableIncome,
} from "@/lib/calculations/tax"
import { bracketBandColorForRate } from "@/components/dashboard/tax/tax-bracket-ladder"

describe("tax bracket chart scale", () => {
  it("layer widths sum to axis max", () => {
    const axis = 600_000
    const layers = getResidentBracketChartLayers(axis)
    const sum = layers.reduce((s, l) => s + l.widthDollars, 0)
    expect(sum).toBe(axis)
  })

  it("resolveTaxBracketChartAxisMaxDollars floors to ladder minimum", () => {
    expect(
      resolveTaxBracketChartAxisMaxDollars({ chargeableIncome: 40_000 })
    ).toBeGreaterThanOrEqual(500_000)
  })

  it("chargeableIncomeInLayer clips to band", () => {
    expect(chargeableIncomeInLayer(25_000, 20_000, 30_000)).toBe(5000)
    expect(chargeableIncomeInLayer(15_000, 20_000, 30_000)).toBe(0)
  })

  it("countedManualReliefForType treats donations at 250%", () => {
    expect(countedManualReliefForType("donations", 1000)).toBe(2500)
  })

  it("previewChargeableAfterExtraCountedRelief respects cap", () => {
    const ci = previewChargeableAfterExtraCountedRelief({
      employmentIncome: 100_000,
      reliefsRawTotal: 75_000,
      extraCountedRelief: 20_000,
    })
    expect(ci).toBe(20_000)
  })

  it("taxDeltaFromLowerChargeableIncome is non-negative when chargeable drops", () => {
    const d = taxDeltaFromLowerChargeableIncome({
      chargeableBefore: 60_000,
      chargeableAfter: 50_000,
      year: 2026,
    })
    expect(d.taxBeforeRebateDelta).toBeGreaterThan(0)
    expect(d.taxPayableDelta).toBeGreaterThanOrEqual(0)
  })

  it("bracketBandColorForRate is linear scale (low rate more blue, high more red hue)", () => {
    const low = bracketBandColorForRate(0)
    const mid = bracketBandColorForRate(0.12)
    const high = bracketBandColorForRate(0.24)
    expect(low).toMatch(/^hsl\([\d.]+\s+[\d.]+%\s+[\d.]+%\)$/)
    expect(mid).toMatch(/^hsl\(/)
    expect(high).toMatch(/^hsl\(/)
    const hueLow = Number.parseFloat(/^hsl\(([\d.]+)/.exec(low)?.[1] ?? "0")
    const hueHigh = Number.parseFloat(/^hsl\(([\d.]+)/.exec(high)?.[1] ?? "0")
    expect(hueLow).toBeGreaterThan(hueHigh)
  })
})
