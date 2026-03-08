export type CpfRates = {
  employeeRate: number;
  employerRate: number;
  totalRate: number;
  owCeiling: number;
};

export type CpfAllocation = {
  oa: number;
  sa: number;
  ma: number;
};

export type CpfContribution = {
  employee: number;
  employer: number;
  total: number;
  oa: number;
  sa: number;
  ma: number;
};

type RateBracket = {
  maxAge: number;
  employeeRate: number;
  employerRate: number;
  totalRate: number;
};

type AllocationBracket = {
  maxAge: number;
  oa: number;
  sa: number;
  ma: number;
};

const RATES_2025: RateBracket[] = [
  { maxAge: 55, employeeRate: 0.20, employerRate: 0.17, totalRate: 0.37 },
  { maxAge: 60, employeeRate: 0.15, employerRate: 0.155, totalRate: 0.305 },
  { maxAge: 65, employeeRate: 0.09, employerRate: 0.11, totalRate: 0.20 },
  { maxAge: 70, employeeRate: 0.075, employerRate: 0.09, totalRate: 0.165 },
  { maxAge: Infinity, employeeRate: 0.05, employerRate: 0.075, totalRate: 0.125 },
];

const RATES_2026: RateBracket[] = [
  { maxAge: 55, employeeRate: 0.20, employerRate: 0.17, totalRate: 0.37 },
  { maxAge: 60, employeeRate: 0.18, employerRate: 0.16, totalRate: 0.34 },
  { maxAge: 65, employeeRate: 0.125, employerRate: 0.125, totalRate: 0.25 },
  { maxAge: 70, employeeRate: 0.075, employerRate: 0.09, totalRate: 0.165 },
  { maxAge: Infinity, employeeRate: 0.05, employerRate: 0.075, totalRate: 0.125 },
];

const OW_CEILING: Record<number, number> = {
  2025: 7400,
  2026: 8000,
};

const ALLOCATIONS_2025: AllocationBracket[] = [
  { maxAge: 35, oa: 0.3400, sa: 0.0886, ma: 0.5714 },
  { maxAge: 45, oa: 0.3000, sa: 0.1000, ma: 0.6000 },
  { maxAge: 50, oa: 0.2639, sa: 0.1111, ma: 0.6250 },
  { maxAge: 55, oa: 0.2059, sa: 0.1578, ma: 0.6363 },
];

const ALLOCATIONS_2026: AllocationBracket[] = [
  { maxAge: 35, oa: 0.4759, sa: 0.1241, ma: 0.4000 },
  { maxAge: 45, oa: 0.4287, sa: 0.1428, ma: 0.4285 },
  { maxAge: 50, oa: 0.3839, sa: 0.1616, ma: 0.4545 },
  { maxAge: 55, oa: 0.3020, sa: 0.2314, ma: 0.4666 },
  { maxAge: 60, oa: 0.2725, sa: 0.2609, ma: 0.4666 },
  { maxAge: 65, oa: 0.1115, sa: 0.3501, ma: 0.5384 },
];

const RATES_BY_YEAR: Record<number, RateBracket[]> = {
  2025: RATES_2025,
  2026: RATES_2026,
};

const ALLOCATIONS_BY_YEAR: Record<number, AllocationBracket[]> = {
  2025: ALLOCATIONS_2025,
  2026: ALLOCATIONS_2026,
};

function roundToCent(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getAge(birthYear: number, referenceYear?: number): number {
  const refYear = referenceYear ?? new Date().getFullYear();
  return refYear - birthYear;
}

export function getCpfRates(age: number, year: number = 2026): CpfRates {
  const brackets = RATES_BY_YEAR[year] ?? RATES_BY_YEAR[2026]!;
  const bracket = brackets.find((b) => age <= b.maxAge) ?? brackets[brackets.length - 1]!;
  const owCeiling = OW_CEILING[year] ?? OW_CEILING[2026]!;

  return {
    employeeRate: bracket.employeeRate,
    employerRate: bracket.employerRate,
    totalRate: bracket.totalRate,
    owCeiling,
  };
}

export function getCpfAllocation(age: number, year: number = 2026): CpfAllocation {
  const brackets = ALLOCATIONS_BY_YEAR[year] ?? ALLOCATIONS_BY_YEAR[2026]!;
  const bracket = brackets.find((b) => age <= b.maxAge) ?? brackets[brackets.length - 1]!;

  return {
    oa: bracket.oa,
    sa: bracket.sa,
    ma: bracket.ma,
  };
}

export function calculateCpfContribution(
  monthlyGross: number,
  age: number,
  year: number = 2026,
): CpfContribution {
  const rates = getCpfRates(age, year);
  const cpfableWage = Math.min(monthlyGross, rates.owCeiling);

  const employee = roundToCent(cpfableWage * rates.employeeRate);
  const employer = roundToCent(cpfableWage * rates.employerRate);
  const total = roundToCent(employee + employer);

  const allocation = getCpfAllocation(age, year);
  const oa = roundToCent(total * allocation.oa);
  const sa = roundToCent(total * allocation.sa);
  const ma = roundToCent(total - oa - sa);

  return { employee, employer, total, oa, sa, ma };
}

export function calculateAnnualCpf(
  annualSalary: number,
  bonus: number,
  age: number,
  year: number = 2026,
): {
  totalEmployee: number;
  totalEmployer: number;
  total: number;
  oa: number;
  sa: number;
  ma: number;
  monthlyContribution: CpfContribution;
} {
  const monthlySalary = annualSalary / 12;
  const rates = getCpfRates(age, year);
  const allocation = getCpfAllocation(age, year);

  const monthlyContribution = calculateCpfContribution(monthlySalary, age, year);

  let totalEmployee = monthlyContribution.employee * 12;
  let totalEmployer = monthlyContribution.employer * 12;

  const awCeiling = 102000 - 12 * Math.min(monthlySalary, rates.owCeiling);
  const cpfableBonus = Math.min(bonus, Math.max(awCeiling, 0));

  if (cpfableBonus > 0) {
    const bonusEmployee = roundToCent(cpfableBonus * rates.employeeRate);
    const bonusEmployer = roundToCent(cpfableBonus * rates.employerRate);
    totalEmployee = roundToCent(totalEmployee + bonusEmployee);
    totalEmployer = roundToCent(totalEmployer + bonusEmployer);
  }

  const total = roundToCent(totalEmployee + totalEmployer);

  const oa = roundToCent(total * allocation.oa);
  const sa = roundToCent(total * allocation.sa);
  const ma = roundToCent(total - oa - sa);

  return {
    totalEmployee,
    totalEmployer,
    total,
    oa,
    sa,
    ma,
    monthlyContribution,
  };
}
