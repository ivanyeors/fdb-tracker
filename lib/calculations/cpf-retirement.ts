import type { CpfContribution } from "./cpf";

export type RetirementSums = {
  brs: number;
  frs: number;
  ers: number;
  brsMonthlyPayout: { min: number; max: number };
  frsMonthlyPayout: { min: number; max: number };
  ersMonthlyPayout: { min: number; max: number };
};

export type CpfProjectionPoint = {
  age: number;
  year: number;
  oa: number;
  sa: number;
  ma: number;
  total: number;
};

export type RetirementGap = {
  target: number;
  current: number;
  gap: number;
  gapPercentage: number;
  onTrack: boolean;
};

type RetirementSumsData = {
  brs: number;
  frs: number;
  ers: number;
  brsMonthlyPayout: { min: number; max: number };
  frsMonthlyPayout: { min: number; max: number };
  ersMonthlyPayout: { min: number; max: number };
};

const RETIREMENT_SUMS: Record<number, RetirementSumsData> = {
  2025: {
    brs: 106500,
    frs: 213000,
    ers: 426000,
    brsMonthlyPayout: { min: 850, max: 900 },
    frsMonthlyPayout: { min: 1570, max: 1680 },
    ersMonthlyPayout: { min: 3050, max: 3270 },
  },
  2026: {
    brs: 110200,
    frs: 220400,
    ers: 440800,
    brsMonthlyPayout: { min: 890, max: 930 },
    frsMonthlyPayout: { min: 1640, max: 1750 },
    ersMonthlyPayout: { min: 3180, max: 3410 },
  },
  2027: {
    brs: 114100,
    frs: 228200,
    ers: 456400,
    brsMonthlyPayout: { min: 920, max: 970 },
    frsMonthlyPayout: { min: 1710, max: 1830 },
    ersMonthlyPayout: { min: 3310, max: 3560 },
  },
};

function roundToCent(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getRetirementSums(cohortYear: number = 2026): RetirementSums {
  const data = RETIREMENT_SUMS[cohortYear] ?? RETIREMENT_SUMS[2026];
  return { ...data };
}

export type CpfProjectionParams = {
  currentOa: number;
  currentSa: number;
  currentMa: number;
  monthlyContribution: CpfContribution;
  currentAge: number;
  targetAge: number;
  incomeGrowthRate?: number;
  /** OA deduction per month (e.g. DPS premium spread). Called with (age, calendarYear) for band updates. */
  getMonthlyOaDeduction?: (age: number, calendarYear: number) => number;
  /** MA deduction per month (e.g. MSL, CSL, ISP healthcare premiums). Called with (age, calendarYear). */
  getMonthlyMaDeduction?: (age: number, calendarYear: number) => number;
};

/**
 * Project CPF growth using the actual CPF interest crediting model:
 * - Contributions and deductions are applied monthly
 * - Interest is calculated on the sum of monthly closing balances and credited once at year-end
 *   (interest = sum of monthly closing balances × annual rate / 12)
 * - Extra interest (1% on first $60k, with first $20k from OA) applied on average balance
 * - Age ≥ 55 bonus: additional 2% on first $30k + 1% on next $30k of extra-eligible balance
 */
export function projectCpfGrowth(params: CpfProjectionParams): CpfProjectionPoint[] {
  const {
    currentOa,
    currentSa,
    currentMa,
    monthlyContribution,
    currentAge,
    targetAge,
    incomeGrowthRate = 0.03,
    getMonthlyOaDeduction,
    getMonthlyMaDeduction,
  } = params;

  if (targetAge <= currentAge) return [];

  const OA_RATE = 0.025;
  const SA_RATE = 0.04;
  const MA_RATE = 0.04;
  const EXTRA_RATE = 0.01;

  let oa = currentOa;
  let sa = currentSa;
  let ma = currentMa;

  let currentMonthlyOa = monthlyContribution.oa;
  let currentMonthlySa = monthlyContribution.sa;
  let currentMonthlyMa = monthlyContribution.ma;

  const points: CpfProjectionPoint[] = [];
  const startYear = new Date().getFullYear();

  for (let yearOffset = 0; yearOffset <= targetAge - currentAge; yearOffset++) {
    const age = currentAge + yearOffset;
    const year = startYear + yearOffset;

    if (yearOffset > 0) {
      const growthFactor = 1 + incomeGrowthRate;
      currentMonthlyOa = roundToCent(currentMonthlyOa * growthFactor);
      currentMonthlySa = roundToCent(currentMonthlySa * growthFactor);
      currentMonthlyMa = roundToCent(currentMonthlyMa * growthFactor);
    }

    const monthlyDps = getMonthlyOaDeduction?.(age, year) ?? 0;
    const monthlyHealthcare = getMonthlyMaDeduction?.(age, year) ?? 0;

    // Accumulate monthly closing balances for year-end interest calculation
    let sumOaClosing = 0;
    let sumSaClosing = 0;
    let sumMaClosing = 0;

    for (let month = 0; month < 12; month++) {
      // Add contributions
      oa += currentMonthlyOa;
      sa += currentMonthlySa;
      ma += currentMonthlyMa;

      // Apply OA deductions (DPS, housing)
      if (monthlyDps > 0) {
        oa = roundToCent(Math.max(0, oa - monthlyDps));
      }

      // Apply MA deductions (healthcare)
      if (monthlyHealthcare > 0) {
        ma = roundToCent(Math.max(0, ma - monthlyHealthcare));
      }

      // Record closing balance for interest calculation
      sumOaClosing += oa;
      sumSaClosing += sa;
      sumMaClosing += ma;
    }

    // Year-end interest crediting (CPF actual method)
    // interest = sum of monthly closing balances × annual rate / 12
    const oaInterest = roundToCent((sumOaClosing * OA_RATE) / 12);
    const saInterest = roundToCent((sumSaClosing * SA_RATE) / 12);
    const maInterest = roundToCent((sumMaClosing * MA_RATE) / 12);

    oa = roundToCent(oa + oaInterest);
    sa = roundToCent(sa + saInterest);
    ma = roundToCent(ma + maInterest);

    // Extra interest on first $60k combined (first $20k from OA)
    // Calculated on average monthly balance
    const avgOa = sumOaClosing / 12;
    const avgSa = sumSaClosing / 12;
    const avgMa = sumMaClosing / 12;

    const oaForExtra = Math.min(avgOa, 20000);
    const remainingCap = 60000 - oaForExtra;
    const saForExtra = Math.min(avgSa, remainingCap);
    const maForExtra = Math.min(avgMa, Math.max(remainingCap - saForExtra, 0));
    const extraBase = oaForExtra + saForExtra + maForExtra;

    let extraInterest = roundToCent(extraBase * EXTRA_RATE);

    // Age ≥ 55 bonus interest
    if (age >= 55) {
      const secondTier = Math.min(extraBase, 30000);
      const thirdTier = Math.min(Math.max(extraBase - 30000, 0), 30000);
      extraInterest += roundToCent(secondTier * 0.02 + thirdTier * 0.01);
    }

    // Distribute extra interest proportionally across accounts
    if (extraBase > 0 && extraInterest > 0) {
      const oaProp = oaForExtra / extraBase;
      const saProp = saForExtra / extraBase;
      const maProp = maForExtra / extraBase;
      oa = roundToCent(oa + extraInterest * oaProp);
      sa = roundToCent(sa + extraInterest * saProp);
      ma = roundToCent(ma + extraInterest * maProp);
    }

    points.push({
      age,
      year,
      oa: roundToCent(oa),
      sa: roundToCent(sa),
      ma: roundToCent(ma),
      total: roundToCent(oa + sa + ma),
    });
  }

  return points;
}

export function calculateRetirementGap(
  projectedTotal: number,
  targetSum: number,
): RetirementGap {
  const gap = roundToCent(targetSum - projectedTotal);
  const gapPercentage =
    targetSum === 0 ? 0 : roundToCent((gap / targetSum) * 100);

  return {
    target: targetSum,
    current: projectedTotal,
    gap,
    gapPercentage,
    onTrack: projectedTotal >= targetSum,
  };
}

export function findBenchmarkAge(
  projectionPoints: CpfProjectionPoint[],
  targetAmount: number,
): number | null {
  const point = projectionPoints.find((p) => p.total >= targetAmount);
  return point?.age ?? null;
}
