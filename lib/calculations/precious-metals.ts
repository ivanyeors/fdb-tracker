/**
 * Mark-to-market for OCBC-style precious metals (SGD per troy oz).
 * Uses sell (bid) price for conservative portfolio value per product plan.
 */

export type PreciousMetalValuationInput = {
  unitsOz: number
  sellPriceSgdPerOz: number
  /** OCBC buy price when available; falls back to sell when null. */
  buyPriceSgdPerOz: number | null
  /** Total amount paid for the position (units × average cost per oz). */
  totalCostBasisSgd: number
}

export type PreciousMetalValuation = {
  buyPriceSgdPerOz: number
  sellPriceSgdPerOz: number
  currentValueSgd: number
  totalCostBasisSgd: number
  pnlSgd: number
  pnlPct: number
}

export function valuatePreciousMetalOz(
  input: PreciousMetalValuationInput,
): PreciousMetalValuation {
  const sell = input.sellPriceSgdPerOz
  const buy = input.buyPriceSgdPerOz ?? sell
  const currentValueSgd = input.unitsOz * sell
  const totalCostBasisSgd = input.totalCostBasisSgd
  const pnlSgd = currentValueSgd - totalCostBasisSgd
  const pnlPct =
    totalCostBasisSgd > 0 ? (pnlSgd / totalCostBasisSgd) * 100 : 0

  return {
    buyPriceSgdPerOz: buy,
    sellPriceSgdPerOz: sell,
    currentValueSgd,
    totalCostBasisSgd,
    pnlSgd,
    pnlPct,
  }
}

function valuateMetalPosition(
  unitsOz: number,
  sellPriceSgdPerOz: number,
  totalCostBasisSgd: number,
  buyPriceSgdPerOz?: number | null,
): PreciousMetalValuation {
  return valuatePreciousMetalOz({
    unitsOz,
    sellPriceSgdPerOz,
    buyPriceSgdPerOz: buyPriceSgdPerOz ?? null,
    totalCostBasisSgd,
  })
}

/** Gold position: alias of {@link valuateMetalPosition}; naming matches build plan. */
export const valuateGold = valuateMetalPosition

/** Silver position: alias of {@link valuateMetalPosition}; naming matches build plan. */
export const valuateSilver = valuateMetalPosition
