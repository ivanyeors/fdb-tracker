export type MetalValuation = {
  metalType: "gold" | "silver";
  unitsOz: number;
  pricePerOz: number;
  totalValue: number;
  costBasis: number;
  pnl: number;
  pnlPct: number;
};

const OZ_TO_GRAMS = 31.1035;

export function valuateGold(
  unitsOz: number,
  ocbcSellPrice: number,
  costBasis?: number,
): MetalValuation {
  const totalValue = unitsOz * ocbcSellPrice;
  const basis = costBasis ?? 0;
  const pnl = totalValue - basis;
  const pnlPct = basis !== 0 ? (pnl / basis) * 100 : 0;

  return {
    metalType: "gold",
    unitsOz,
    pricePerOz: ocbcSellPrice,
    totalValue,
    costBasis: basis,
    pnl,
    pnlPct,
  };
}

export function valuateSilver(
  unitsOz: number,
  ocbcSellPrice: number,
  costBasis?: number,
): MetalValuation {
  const totalValue = unitsOz * ocbcSellPrice;
  const basis = costBasis ?? 0;
  const pnl = totalValue - basis;
  const pnlPct = basis !== 0 ? (pnl / basis) * 100 : 0;

  return {
    metalType: "silver",
    unitsOz,
    pricePerOz: ocbcSellPrice,
    totalValue,
    costBasis: basis,
    pnl,
    pnlPct,
  };
}

export function formatMetalAmount(unitsOz: number): string {
  if (unitsOz < 1) {
    const grams = unitsOz * OZ_TO_GRAMS;
    return `${grams.toFixed(2)} g`;
  }
  return `${unitsOz.toFixed(2)} oz`;
}
