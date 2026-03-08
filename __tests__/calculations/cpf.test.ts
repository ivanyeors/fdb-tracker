import {
  getAge,
  getCpfRates,
  getCpfAllocation,
  calculateCpfContribution,
  calculateAnnualCpf,
} from "@/lib/calculations/cpf";

describe("getAge", () => {
  it("returns correct age given birth year and reference year", () => {
    expect(getAge(1996, 2026)).toBe(30);
  });

  it("returns correct age for older person", () => {
    expect(getAge(1968, 2026)).toBe(58);
  });

  it("defaults to current year when no reference year provided", () => {
    const currentYear = new Date().getFullYear();
    expect(getAge(2000)).toBe(currentYear - 2000);
  });
});

describe("getCpfRates", () => {
  it("returns correct rates for age 30, year 2026", () => {
    const rates = getCpfRates(30, 2026);
    expect(rates.employeeRate).toBe(0.20);
    expect(rates.employerRate).toBe(0.17);
    expect(rates.totalRate).toBe(0.37);
    expect(rates.owCeiling).toBe(8000);
  });

  it("returns correct rates for age 58, year 2026", () => {
    const rates = getCpfRates(58, 2026);
    expect(rates.employeeRate).toBe(0.18);
    expect(rates.employerRate).toBe(0.16);
    expect(rates.totalRate).toBe(0.34);
  });

  it("returns OW ceiling of $7,400 for year 2025", () => {
    const rates = getCpfRates(30, 2025);
    expect(rates.owCeiling).toBe(7400);
  });

  it("returns correct rates for age 55, year 2026 (boundary)", () => {
    const rates = getCpfRates(55, 2026);
    expect(rates.employeeRate).toBe(0.20);
    expect(rates.employerRate).toBe(0.17);
  });

  it("returns correct rates for age 62, year 2026", () => {
    const rates = getCpfRates(62, 2026);
    expect(rates.employeeRate).toBe(0.125);
    expect(rates.employerRate).toBe(0.125);
  });

  it("returns correct rates for age 68, year 2026", () => {
    const rates = getCpfRates(68, 2026);
    expect(rates.employeeRate).toBe(0.075);
    expect(rates.employerRate).toBe(0.09);
  });

  it("returns correct rates for age 75 (above 70), year 2026", () => {
    const rates = getCpfRates(75, 2026);
    expect(rates.employeeRate).toBe(0.05);
    expect(rates.employerRate).toBe(0.075);
  });

  it("defaults to 2026 rates for unknown year", () => {
    const rates = getCpfRates(30, 2030);
    expect(rates.employeeRate).toBe(0.20);
    expect(rates.owCeiling).toBe(8000);
  });

  it("defaults to 2026 when year parameter is omitted", () => {
    const rates = getCpfRates(30);
    expect(rates.owCeiling).toBe(8000);
  });
});

describe("getCpfAllocation", () => {
  it("returns correct allocation for age 30, year 2026", () => {
    const alloc = getCpfAllocation(30, 2026);
    expect(alloc.oa).toBe(0.4759);
    expect(alloc.sa).toBe(0.1241);
    expect(alloc.ma).toBe(0.4000);
  });

  it("returns correct allocation for age 40, year 2026", () => {
    const alloc = getCpfAllocation(40, 2026);
    expect(alloc.oa).toBe(0.4287);
    expect(alloc.sa).toBe(0.1428);
    expect(alloc.ma).toBe(0.4285);
  });

  it("returns correct allocation for age 48, year 2026", () => {
    const alloc = getCpfAllocation(48, 2026);
    expect(alloc.oa).toBe(0.3839);
    expect(alloc.sa).toBe(0.1616);
    expect(alloc.ma).toBe(0.4545);
  });

  it("returns correct allocation for age 53, year 2026", () => {
    const alloc = getCpfAllocation(53, 2026);
    expect(alloc.oa).toBe(0.3020);
    expect(alloc.sa).toBe(0.2314);
    expect(alloc.ma).toBe(0.4666);
  });

  it("returns correct allocation for age 58, year 2026", () => {
    const alloc = getCpfAllocation(58, 2026);
    expect(alloc.oa).toBe(0.2725);
    expect(alloc.sa).toBe(0.2609);
    expect(alloc.ma).toBe(0.4666);
  });

  it("returns correct allocation for age 63, year 2026", () => {
    const alloc = getCpfAllocation(63, 2026);
    expect(alloc.oa).toBe(0.1115);
    expect(alloc.sa).toBe(0.3501);
    expect(alloc.ma).toBe(0.5384);
  });

  it("returns last bracket for ages above all brackets in 2026", () => {
    const alloc = getCpfAllocation(70, 2026);
    expect(alloc.oa).toBe(0.1115);
    expect(alloc.sa).toBe(0.3501);
    expect(alloc.ma).toBe(0.5384);
  });

  it("returns 2025 allocations for year 2025", () => {
    const alloc = getCpfAllocation(30, 2025);
    expect(alloc.oa).toBe(0.3400);
    expect(alloc.sa).toBe(0.0886);
    expect(alloc.ma).toBe(0.5714);
  });

  it("defaults to 2026 for unknown year", () => {
    const alloc = getCpfAllocation(30, 2030);
    expect(alloc.oa).toBe(0.4759);
  });
});

describe("calculateCpfContribution", () => {
  it("calculates correctly for $6,000/mth, age 30, year 2026", () => {
    const result = calculateCpfContribution(6000, 30, 2026);
    expect(result.employee).toBe(1200);
    expect(result.employer).toBe(1020);
    expect(result.total).toBe(2220);
  });

  it("caps at OW ceiling for $10,000/mth, age 30, year 2026", () => {
    const result = calculateCpfContribution(10000, 30, 2026);
    expect(result.employee).toBe(1600);
    expect(result.employer).toBe(1360);
    expect(result.total).toBe(2960);
  });

  it("allocates total across OA, SA, MA summing to total", () => {
    const result = calculateCpfContribution(6000, 30, 2026);
    expect(result.oa + result.sa + result.ma).toBeCloseTo(result.total, 2);
  });

  it("computes allocation proportions for age 30, 2026", () => {
    const result = calculateCpfContribution(6000, 30, 2026);
    const total = result.total;
    expect(result.oa).toBeCloseTo(total * 0.4759, 0);
    expect(result.sa).toBeCloseTo(total * 0.1241, 0);
  });

  it("returns zero employee/employer for $0 wage", () => {
    const result = calculateCpfContribution(0, 30, 2026);
    expect(result.employee).toBe(0);
    expect(result.employer).toBe(0);
    expect(result.total).toBe(0);
  });

  it("uses reduced rates for age 58, year 2026", () => {
    const result = calculateCpfContribution(6000, 58, 2026);
    expect(result.employee).toBe(1080);
    expect(result.employer).toBe(960);
  });
});

describe("calculateAnnualCpf", () => {
  it("calculates annual CPF for $84,000 salary, no bonus, age 30, 2026", () => {
    const result = calculateAnnualCpf(84000, 0, 30, 2026);
    expect(result.totalEmployee).toBe(1400 * 12);
    expect(result.totalEmployer).toBe(1190 * 12);
    expect(result.monthlyContribution.employee).toBe(1400);
  });

  it("includes bonus in annual CPF within AW ceiling", () => {
    const result = calculateAnnualCpf(84000, 7000, 30, 2026);
    const resultNoBonus = calculateAnnualCpf(84000, 0, 30, 2026);
    expect(result.totalEmployee).toBeGreaterThan(resultNoBonus.totalEmployee);
  });

  it("caps bonus CPF at AW ceiling", () => {
    const monthlySalary = 84000 / 12;
    const owCeiling = 8000;
    const awCeiling = 102000 - 12 * Math.min(monthlySalary, owCeiling);
    const hugeBonus = 200000;
    const result = calculateAnnualCpf(84000, hugeBonus, 30, 2026);
    const resultCapped = calculateAnnualCpf(84000, awCeiling, 30, 2026);
    expect(result.totalEmployee).toBe(resultCapped.totalEmployee);
  });

  it("returns correct OA, SA, MA breakdown that sums to total", () => {
    const result = calculateAnnualCpf(84000, 7000, 30, 2026);
    expect(result.oa + result.sa + result.ma).toBeCloseTo(result.total, 0);
  });

  it("handles zero bonus correctly", () => {
    const result = calculateAnnualCpf(84000, 0, 30, 2026);
    expect(result.totalEmployee).toBe(result.monthlyContribution.employee * 12);
  });

  it("handles salary above OW ceiling", () => {
    const result = calculateAnnualCpf(120000, 0, 30, 2026);
    expect(result.monthlyContribution.employee).toBe(8000 * 0.20);
  });
});
