export type EffectiveOutflowBreakdown = {
  discretionary: number;
  insurancePremiums: number;
  ilpPremiums: number;
  loanRepayments: number;
  taxProvision: number;
  total: number;
};

export type MonthlyBalance = {
  month: string;
  openingBalance: number;
  inflow: number;
  effectiveOutflow: EffectiveOutflowBreakdown;
  stockPurchasesNet: number;
  closingBalance: number;
};

export type BalanceTimeline = MonthlyBalance[];

export function getEffectiveOutflow(params: {
  discretionary: number;
  insurancePremiums: number;
  ilpPremiums: number;
  loanRepayments: number;
  taxProvision?: number;
}): EffectiveOutflowBreakdown {
  const taxProvision = params.taxProvision ?? 0;
  const total =
    params.discretionary +
    params.insurancePremiums +
    params.ilpPremiums +
    params.loanRepayments +
    taxProvision;

  return {
    discretionary: params.discretionary,
    insurancePremiums: params.insurancePremiums,
    ilpPremiums: params.ilpPremiums,
    loanRepayments: params.loanRepayments,
    taxProvision,
    total,
  };
}

export function calculateClosingBalance(
  openingBalance: number,
  inflow: number,
  effectiveOutflow: EffectiveOutflowBreakdown,
  stockPurchasesNet?: number,
): number {
  return openingBalance + inflow - effectiveOutflow.total - (stockPurchasesNet ?? 0);
}

export function buildBalanceTimeline(params: {
  openingBalance: number;
  monthlyData: Array<{
    month: string;
    inflow: number;
    discretionaryOutflow: number;
    insurancePremiums: number;
    ilpPremiums: number;
    loanRepayments: number;
    taxProvision?: number;
    stockPurchasesNet?: number;
  }>;
}): BalanceTimeline {
  const timeline: BalanceTimeline = [];
  let currentOpening = params.openingBalance;

  for (const data of params.monthlyData) {
    const effectiveOutflow = getEffectiveOutflow({
      discretionary: data.discretionaryOutflow,
      insurancePremiums: data.insurancePremiums,
      ilpPremiums: data.ilpPremiums,
      loanRepayments: data.loanRepayments,
      taxProvision: data.taxProvision,
    });

    const stockPurchasesNet = data.stockPurchasesNet ?? 0;

    const closingBalance = calculateClosingBalance(
      currentOpening,
      data.inflow,
      effectiveOutflow,
      stockPurchasesNet,
    );

    timeline.push({
      month: data.month,
      openingBalance: currentOpening,
      inflow: data.inflow,
      effectiveOutflow,
      stockPurchasesNet,
      closingBalance,
    });

    currentOpening = closingBalance;
  }

  return timeline;
}

export function calculateSavingsRate(inflow: number, effectiveOutflow: number): number {
  if (inflow === 0) return 0;
  return ((inflow - effectiveOutflow) / inflow) * 100;
}
