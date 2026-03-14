import {
  applyProgressiveBrackets,
  capReliefs,
  applyRebate,
  calculateTax,
  getAutoReliefs,
} from "@/lib/calculations/tax";

describe("applyProgressiveBrackets", () => {
  it("returns 0 for zero or negative chargeable income", () => {
    expect(applyProgressiveBrackets(0)).toBe(0);
    expect(applyProgressiveBrackets(-1000)).toBe(0);
  });

  it("applies 0% to first $20,000", () => {
    expect(applyProgressiveBrackets(20000)).toBe(0);
    expect(applyProgressiveBrackets(10000)).toBe(0);
  });

  it("applies 2% to $20,001–$30,000 band", () => {
    expect(applyProgressiveBrackets(25000)).toBe(100); // 5000 * 0.02
    expect(applyProgressiveBrackets(30000)).toBe(200); // 10000 * 0.02
  });

  it("applies correct rates across multiple brackets", () => {
    // $40,000: 0 + 200 + 350 + 0 = 550
    expect(applyProgressiveBrackets(40000)).toBe(550);
    // $80,000: 0 + 200 + 350 + 2800 = 3350
    expect(applyProgressiveBrackets(80000)).toBe(3350);
  });

  it("handles high income", () => {
    const tax = applyProgressiveBrackets(150000);
    expect(tax).toBeGreaterThan(10000);
    expect(tax).toBeLessThan(25000);
  });
});

describe("capReliefs", () => {
  it("caps at $80,000", () => {
    expect(capReliefs(100000)).toBe(80000);
    expect(capReliefs(80000)).toBe(80000);
  });

  it("returns amount when below cap", () => {
    expect(capReliefs(50000)).toBe(50000);
    expect(capReliefs(0)).toBe(0);
  });

  it("returns 0 for negative", () => {
    expect(capReliefs(-1000)).toBe(0);
  });
});

describe("applyRebate", () => {
  it("applies YA2025 rebate (60% capped $200)", () => {
    expect(applyRebate(500, 2025)).toBe(300); // 500 - 200 = 300
    expect(applyRebate(100, 2025)).toBe(40); // 100 - 60 = 40
    expect(applyRebate(50, 2025)).toBe(20); // 50 - 30 = 20
  });

  it("does not apply rebate for other years", () => {
    expect(applyRebate(500, 2026)).toBe(500);
  });
});

describe("getAutoReliefs", () => {
  it("returns earned income relief by age", () => {
    const { total } = getAutoReliefs(
      { birth_year: 1995 },
      null,
      [],
      2026
    );
    expect(total).toBe(1000); // age 31, ≤54
  });

  it("returns $6,000 for age 55–59", () => {
    const { total } = getAutoReliefs(
      { birth_year: 1968 },
      null,
      [],
      2026
    );
    expect(total).toBe(6000);
  });

  it("returns $8,000 for age 60+", () => {
    const { total } = getAutoReliefs(
      { birth_year: 1960 },
      null,
      [],
      2026
    );
    expect(total).toBe(8000);
  });

  it("adds CPF relief when income config present", () => {
    const { total, breakdown } = getAutoReliefs(
      { birth_year: 1994 },
      { annual_salary: 84000, bonus_estimate: 0 },
      [],
      2026
    );
    expect(total).toBeGreaterThan(1000);
    expect(breakdown.some((r) => r.type === "cpf")).toBe(true);
  });

  it("adds life insurance relief from qualifying policies", () => {
    const { total, breakdown } = getAutoReliefs(
      { birth_year: 1990 },
      { annual_salary: 60000, bonus_estimate: 0 },
      [
        {
          type: "term_life",
          premium_amount: 500,
          frequency: "yearly",
          coverage_amount: 500000,
          is_active: true,
        },
      ],
      2026
    );
    expect(breakdown.some((r) => r.type === "life_insurance")).toBe(true);
    expect(total).toBeGreaterThan(1000);
  });
});

describe("calculateTax", () => {
  it("calculates tax for $100k salary, age 30", () => {
    const result = calculateTax({
      profile: { birth_year: 1994 },
      incomeConfig: { annual_salary: 100000, bonus_estimate: 0 },
      insurancePolicies: [],
      manualReliefs: [],
      year: 2026,
    });

    expect(result.employmentIncome).toBe(100000);
    expect(result.totalReliefs).toBeLessThanOrEqual(80000);
    expect(result.chargeableIncome).toBeGreaterThanOrEqual(0);
    expect(result.taxPayable).toBeGreaterThanOrEqual(0);
    expect(result.effectiveRate).toBeGreaterThanOrEqual(0);
  });

  it("applies $80k relief cap", () => {
    const result = calculateTax({
      profile: { birth_year: 1960 },
      incomeConfig: { annual_salary: 200000, bonus_estimate: 0 },
      insurancePolicies: [],
      manualReliefs: [
        { relief_type: "donations", amount: 50000 },
      ],
      year: 2026,
    });

    expect(result.totalReliefs).toBeLessThanOrEqual(80000);
  });

  it("applies YA2025 rebate", () => {
    const result = calculateTax({
      profile: { birth_year: 1990 },
      incomeConfig: { annual_salary: 50000, bonus_estimate: 0 },
      insurancePolicies: [],
      manualReliefs: [],
      year: 2025,
    });

    expect(result.taxPayable).toBeGreaterThanOrEqual(0);
  });

  it("returns zero tax when reliefs exceed income", () => {
    const result = calculateTax({
      profile: { birth_year: 1990 },
      incomeConfig: { annual_salary: 20000, bonus_estimate: 0 },
      insurancePolicies: [],
      manualReliefs: [{ relief_type: "donations", amount: 50000 }],
      year: 2026,
    });

    expect(result.chargeableIncome).toBe(0);
    expect(result.taxPayable).toBe(0);
  });
});
