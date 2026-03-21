import {
  calculateOcbc360Interest,
  calculateSimpleInterest,
  getOcbc360EffectiveRate,
  type Ocbc360Config,
} from "@/lib/calculations/bank-interest";

const allMet: Ocbc360Config = {
  salaryMet: true,
  saveMet: true,
  spendMet: true,
  insureMet: true,
  investMet: true,
  growMet: false,
};

const noneMet: Ocbc360Config = {
  salaryMet: false,
  saveMet: false,
  spendMet: false,
  insureMet: false,
  investMet: false,
  growMet: false,
};

describe("calculateOcbc360Interest", () => {
  it("computes correct tiered interest for $80,000 with salary+save met", () => {
    const config: Ocbc360Config = {
      salaryMet: true,
      saveMet: true,
      spendMet: false,
      insureMet: false,
      investMet: false,
      growMet: false,
    };
    const result = calculateOcbc360Interest(80000, config);

    const first75k = 75000;
    const next25k = 5000;

    const expectedBase75 = first75k * 0.0005;
    const expectedBase25 = next25k * 0.0005;
    const expectedSalary75 = first75k * 0.016;
    const expectedSalary25 = next25k * 0.032;
    const expectedSave75 = first75k * 0.006;
    const expectedSave25 = next25k * 0.012;

    const expectedAnnual =
      expectedBase75 + expectedBase25 +
      expectedSalary75 + expectedSalary25 +
      expectedSave75 + expectedSave25;

    expect(result.annualInterest).toBeCloseTo(expectedAnnual, 2);
    expect(result.balance).toBe(80000);
    expect(result.monthlyInterest).toBeCloseTo(expectedAnnual / 12, 2);
  });

  it("applies only first band for $50,000 balance", () => {
    const config: Ocbc360Config = {
      salaryMet: true,
      saveMet: false,
      spendMet: false,
      insureMet: false,
      investMet: false,
      growMet: false,
    };
    const result = calculateOcbc360Interest(50000, config);

    const expectedBase = 50000 * 0.0005;
    const expectedSalary = 50000 * 0.016;
    const expectedAnnual = expectedBase + expectedSalary;

    expect(result.annualInterest).toBeCloseTo(expectedAnnual, 2);

    const next25kBreakdowns = result.breakdown.filter((b) => b.next25k > 0);
    expect(next25kBreakdowns).toHaveLength(0);
  });

  it("computes maximum interest when all categories met", () => {
    const result = calculateOcbc360Interest(100000, allMet);

    const first75k = 75000;
    const next25k = 25000;

    const totalFirst =
      first75k * (0.0005 + 0.016 + 0.006 + 0.005 + 0.012 + 0.012);
    const totalNext =
      next25k * (0.0005 + 0.032 + 0.012 + 0.005 + 0.024 + 0.024);

    expect(result.annualInterest).toBeCloseTo(totalFirst + totalNext, 2);
  });

  it("returns only base interest when no categories met", () => {
    const result = calculateOcbc360Interest(100000, noneMet);

    const first75k = 75000;
    const next25k = 25000;
    const expectedAnnual = first75k * 0.0005 + next25k * 0.0005;

    expect(result.annualInterest).toBeCloseTo(expectedAnnual, 2);
  });

  it("auto-enables grow for balance > $250k", () => {
    const config: Ocbc360Config = {
      salaryMet: true,
      saveMet: false,
      spendMet: false,
      insureMet: false,
      investMet: false,
      growMet: false,
    };
    const result = calculateOcbc360Interest(260000, config);

    const growBreakdown = result.breakdown.find((b) => b.category === "Grow");
    expect(growBreakdown!.met).toBe(true);
    expect(growBreakdown!.first75k).toBe(75000 * 0.022);
    expect(growBreakdown!.next25k).toBe(25000 * 0.022);
  });

  it("does not auto-enable grow for balance below $250k", () => {
    const result = calculateOcbc360Interest(249_999, noneMet);
    const growBreakdown = result.breakdown.find((b) => b.category === "Grow");
    expect(growBreakdown!.met).toBe(false);
    expect(growBreakdown!.first75k).toBe(0);
  });

  it("auto-enables grow at exactly $250k", () => {
    const result = calculateOcbc360Interest(250_000, noneMet);
    const growBreakdown = result.breakdown.find((b) => b.category === "Grow");
    expect(growBreakdown!.met).toBe(true);
  });

  it("returns 0 annual rate for zero balance", () => {
    const result = calculateOcbc360Interest(0, allMet);
    expect(result.annualRate).toBe(0);
    expect(result.annualInterest).toBe(0);
  });

  it("correctly marks met/unmet in breakdown", () => {
    const config: Ocbc360Config = {
      salaryMet: true,
      saveMet: false,
      spendMet: true,
      insureMet: false,
      investMet: false,
      growMet: false,
    };
    const result = calculateOcbc360Interest(50000, config);

    const base = result.breakdown.find((b) => b.category === "Base");
    const salary = result.breakdown.find((b) => b.category === "Salary");
    const save = result.breakdown.find((b) => b.category === "Save");
    const spend = result.breakdown.find((b) => b.category === "Spend");
    const insure = result.breakdown.find((b) => b.category === "Insure");

    expect(base!.met).toBe(true);
    expect(salary!.met).toBe(true);
    expect(save!.met).toBe(false);
    expect(spend!.met).toBe(true);
    expect(insure!.met).toBe(false);
  });
});

describe("calculateSimpleInterest", () => {
  it("computes $50/year for $100,000 at 0.05%", () => {
    const result = calculateSimpleInterest(100000, 0.05);
    expect(result.annualInterest).toBe(50);
    expect(result.monthlyInterest).toBeCloseTo(50 / 12, 2);
  });

  it("returns 0 for zero balance", () => {
    const result = calculateSimpleInterest(0, 2.5);
    expect(result.annualInterest).toBe(0);
    expect(result.monthlyInterest).toBe(0);
  });

  it("returns 0 for zero rate", () => {
    const result = calculateSimpleInterest(50000, 0);
    expect(result.annualInterest).toBe(0);
  });

  it("computes correctly for higher rate", () => {
    const result = calculateSimpleInterest(100000, 2.5);
    expect(result.annualInterest).toBe(2500);
    expect(result.monthlyInterest).toBeCloseTo(2500 / 12, 2);
  });
});

describe("getOcbc360EffectiveRate", () => {
  it("returns sum of all met category rates", () => {
    const rates = getOcbc360EffectiveRate(allMet);
    const expected75 = 0.0005 + 0.016 + 0.006 + 0.005 + 0.012 + 0.012;
    const expected25 = 0.0005 + 0.032 + 0.012 + 0.005 + 0.024 + 0.024;
    expect(rates.first75kRate).toBeCloseTo(expected75, 6);
    expect(rates.next25kRate).toBeCloseTo(expected25, 6);
  });

  it("returns only base rate when nothing met", () => {
    const rates = getOcbc360EffectiveRate(noneMet);
    expect(rates.first75kRate).toBe(0.0005);
    expect(rates.next25kRate).toBe(0.0005);
  });
});
