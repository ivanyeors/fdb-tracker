import {
  calculateInsuranceMonthlyDeduction,
  aggregateOutflow,
  validateOutflow,
} from "@/lib/calculations/outflow";

describe("calculateInsuranceMonthlyDeduction", () => {
  it("returns premium as-is for monthly frequency", () => {
    const result = calculateInsuranceMonthlyDeduction(200, "monthly", null, 6);
    expect(result.monthlyEquivalent).toBe(200);
    expect(result.isYearlyDueMonth).toBe(false);
    expect(result.actualMonthAmount).toBe(200);
  });

  it("returns yearly premium / 12 as monthly equivalent", () => {
    const result = calculateInsuranceMonthlyDeduction(2400, "yearly", 6, 3);
    expect(result.monthlyEquivalent).toBe(200);
    expect(result.isYearlyDueMonth).toBe(false);
    expect(result.actualMonthAmount).toBe(0);
  });

  it("flags due month and returns full premium when current = due month", () => {
    const result = calculateInsuranceMonthlyDeduction(2400, "yearly", 6, 6);
    expect(result.monthlyEquivalent).toBe(200);
    expect(result.isYearlyDueMonth).toBe(true);
    expect(result.actualMonthAmount).toBe(2400);
  });

  it("returns 0 actual amount for yearly policy when not due month", () => {
    const result = calculateInsuranceMonthlyDeduction(2400, "yearly", 6, 1);
    expect(result.actualMonthAmount).toBe(0);
    expect(result.isYearlyDueMonth).toBe(false);
  });

  it("handles null yearlyOutflowDate for yearly frequency", () => {
    const result = calculateInsuranceMonthlyDeduction(1200, "yearly", null, 5);
    expect(result.monthlyEquivalent).toBe(100);
    expect(result.isYearlyDueMonth).toBe(false);
    expect(result.actualMonthAmount).toBe(0);
  });
});

describe("aggregateOutflow", () => {
  it("aggregates all categories correctly", () => {
    const result = aggregateOutflow({
      discretionary: 3000,
      insurancePolicies: [
        {
          id: "1",
          name: "Term Life",
          premium: 200,
          frequency: "monthly",
          yearlyOutflowDate: null,
          isActive: true,
          deductFromOutflow: true,
        },
      ],
      ilpProducts: [{ monthlyPremium: 500, isActive: true }],
      loanRepayments: 1500,
      currentMonth: 6,
    });

    expect(result.discretionary).toBe(3000);
    expect(result.insuranceTotal).toBe(200);
    expect(result.ilpPremiums).toBe(500);
    expect(result.loanRepayments).toBe(1500);
    expect(result.effectiveTotal).toBe(5200);
  });

  it("excludes inactive insurance policies", () => {
    const result = aggregateOutflow({
      discretionary: 3000,
      insurancePolicies: [
        {
          id: "1",
          name: "Term Life",
          premium: 200,
          frequency: "monthly",
          yearlyOutflowDate: null,
          isActive: false,
          deductFromOutflow: true,
        },
      ],
      ilpProducts: [],
      loanRepayments: 0,
      currentMonth: 1,
    });

    expect(result.insuranceTotal).toBe(0);
    expect(result.insurance).toHaveLength(0);
  });

  it("excludes policies not marked for outflow deduction", () => {
    const result = aggregateOutflow({
      discretionary: 3000,
      insurancePolicies: [
        {
          id: "1",
          name: "CI Plan",
          premium: 300,
          frequency: "monthly",
          yearlyOutflowDate: null,
          isActive: true,
          deductFromOutflow: false,
        },
      ],
      ilpProducts: [],
      loanRepayments: 0,
      currentMonth: 1,
    });

    expect(result.insuranceTotal).toBe(0);
  });

  it("excludes inactive ILP products", () => {
    const result = aggregateOutflow({
      discretionary: 1000,
      insurancePolicies: [],
      ilpProducts: [
        { monthlyPremium: 500, isActive: false },
        { monthlyPremium: 300, isActive: true },
      ],
      loanRepayments: 0,
      currentMonth: 1,
    });

    expect(result.ilpPremiums).toBe(300);
  });

  it("includes tax provision and stock purchases when provided", () => {
    const result = aggregateOutflow({
      discretionary: 2000,
      insurancePolicies: [],
      ilpProducts: [],
      loanRepayments: 500,
      taxProvision: 400,
      stockPurchasesNet: 1000,
      currentMonth: 1,
    });

    expect(result.taxProvision).toBe(400);
    expect(result.stockPurchasesNet).toBe(1000);
    expect(result.effectiveTotal).toBe(2900);
  });

  it("handles yearly insurance with monthly equivalent in insuranceTotal", () => {
    const result = aggregateOutflow({
      discretionary: 1000,
      insurancePolicies: [
        {
          id: "1",
          name: "Whole Life",
          premium: 2400,
          frequency: "yearly",
          yearlyOutflowDate: 6,
          isActive: true,
          deductFromOutflow: true,
        },
      ],
      ilpProducts: [],
      loanRepayments: 0,
      currentMonth: 3,
    });

    expect(result.insuranceTotal).toBe(200);
    expect(result.insurance[0].monthlyAmount).toBe(200);
    expect(result.insurance[0].actualMonthAmount).toBe(0);
  });

  it("handles empty inputs gracefully", () => {
    const result = aggregateOutflow({
      discretionary: 0,
      insurancePolicies: [],
      ilpProducts: [],
      loanRepayments: 0,
      currentMonth: 1,
    });

    expect(result.effectiveTotal).toBe(0);
    expect(result.insurance).toHaveLength(0);
  });
});

describe("validateOutflow", () => {
  it("warns when total outflow exceeds 120% of take-home", () => {
    const result = validateOutflow(5000, 2000, 5000);
    expect(result.isValid).toBe(false);
    expect(result.warnings).toContain("Total outflow exceeds 120% of take-home pay");
  });

  it("returns valid when outflow is within 120%", () => {
    const result = validateOutflow(3000, 700, 5600);
    expect(result.isValid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("warns when discretionary alone is high (> 80% of take-home)", () => {
    const result = validateOutflow(5000, 0, 5600);
    expect(result.isValid).toBe(false);
    expect(result.warnings).toContain(
      "Discretionary outflow seems high — did you include insurance/loan payments?"
    );
  });

  it("returns valid for reasonable outflow", () => {
    const result = validateOutflow(2000, 1000, 5600);
    expect(result.isValid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("can trigger both warnings simultaneously", () => {
    const result = validateOutflow(5000, 3000, 5000);
    expect(result.isValid).toBe(false);
    expect(result.warnings.length).toBe(2);
  });

  it("handles zero take-home edge case", () => {
    const result = validateOutflow(100, 100, 0);
    expect(result.isValid).toBe(false);
  });
});
