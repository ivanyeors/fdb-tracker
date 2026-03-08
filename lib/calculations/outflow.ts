export type InsuranceDeduction = {
  policyId: string;
  policyName: string;
  monthlyAmount: number;
  isYearlyDueMonth: boolean;
  actualMonthAmount: number;
};

export type OutflowBreakdown = {
  discretionary: number;
  insurance: InsuranceDeduction[];
  insuranceTotal: number;
  ilpPremiums: number;
  loanRepayments: number;
  taxProvision: number;
  effectiveTotal: number;
  stockPurchasesNet: number;
};

export type OutflowValidation = {
  isValid: boolean;
  warnings: string[];
};

export function calculateInsuranceMonthlyDeduction(
  premium: number,
  frequency: "monthly" | "yearly",
  yearlyOutflowDate: number | null,
  currentMonth: number,
): { monthlyEquivalent: number; isYearlyDueMonth: boolean; actualMonthAmount: number } {
  if (frequency === "monthly") {
    return {
      monthlyEquivalent: premium,
      isYearlyDueMonth: false,
      actualMonthAmount: premium,
    };
  }

  const monthlyEquivalent = premium / 12;
  const isYearlyDueMonth = currentMonth === yearlyOutflowDate;
  const actualMonthAmount = isYearlyDueMonth ? premium : 0;

  return { monthlyEquivalent, isYearlyDueMonth, actualMonthAmount };
}

export function aggregateOutflow(params: {
  discretionary: number;
  insurancePolicies: Array<{
    id: string;
    name: string;
    premium: number;
    frequency: "monthly" | "yearly";
    yearlyOutflowDate: number | null;
    isActive: boolean;
    deductFromOutflow: boolean;
  }>;
  ilpProducts: Array<{
    monthlyPremium: number;
    isActive: boolean;
  }>;
  loanRepayments: number;
  taxProvision?: number;
  stockPurchasesNet?: number;
  currentMonth: number;
}): OutflowBreakdown {
  const activePolicies = params.insurancePolicies.filter(
    (p) => p.isActive && p.deductFromOutflow,
  );

  const insurance: InsuranceDeduction[] = activePolicies.map((policy) => {
    const deduction = calculateInsuranceMonthlyDeduction(
      policy.premium,
      policy.frequency,
      policy.yearlyOutflowDate,
      params.currentMonth,
    );

    return {
      policyId: policy.id,
      policyName: policy.name,
      monthlyAmount: deduction.monthlyEquivalent,
      isYearlyDueMonth: deduction.isYearlyDueMonth,
      actualMonthAmount: deduction.actualMonthAmount,
    };
  });

  const insuranceTotal = insurance.reduce((sum, d) => sum + d.monthlyAmount, 0);

  const ilpPremiums = params.ilpProducts
    .filter((p) => p.isActive)
    .reduce((sum, p) => sum + p.monthlyPremium, 0);

  const taxProvision = params.taxProvision ?? 0;
  const stockPurchasesNet = params.stockPurchasesNet ?? 0;

  const effectiveTotal =
    params.discretionary + insuranceTotal + ilpPremiums + params.loanRepayments + taxProvision;

  return {
    discretionary: params.discretionary,
    insurance,
    insuranceTotal,
    ilpPremiums,
    loanRepayments: params.loanRepayments,
    taxProvision,
    effectiveTotal,
    stockPurchasesNet,
  };
}

export function validateOutflow(
  discretionary: number,
  autoDeductions: number,
  expectedTakeHome: number,
): OutflowValidation {
  const warnings: string[] = [];

  if (discretionary + autoDeductions > expectedTakeHome * 1.2) {
    warnings.push("Total outflow exceeds 120% of take-home pay");
  }

  if (discretionary > expectedTakeHome * 0.8) {
    warnings.push(
      "Discretionary outflow seems high — did you include insurance/loan payments?",
    );
  }

  return {
    isValid: warnings.length === 0,
    warnings,
  };
}
