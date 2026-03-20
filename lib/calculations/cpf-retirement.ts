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
  const data = RETIREMENT_SUMS[cohortYear] ?? RETIREMENT_SUMS[2026]!;
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
};

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
  } = params;

  if (targetAge <= currentAge) return [];

  const OA_RATE = 0.025;
  const SA_RATE = 0.04;
  const MA_RATE = 0.04;

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

    for (let month = 0; month < 12; month++) {
      oa += currentMonthlyOa;
      sa += currentMonthlySa;
      ma += currentMonthlyMa;

      if (monthlyDps > 0) {
        oa = roundToCent(Math.max(0, oa - monthlyDps));
      }

      const monthlyOaRate = OA_RATE / 12;
      const monthlySaRate = SA_RATE / 12;
      const monthlyMaRate = MA_RATE / 12;

      oa = roundToCent(oa * (1 + monthlyOaRate));
      sa = roundToCent(sa * (1 + monthlySaRate));
      ma = roundToCent(ma * (1 + monthlyMaRate));

      const oaForExtra = Math.min(oa, 20000);
      const remainingCap = 60000 - oaForExtra;
      const saForExtra = Math.min(sa, remainingCap);
      const maForExtra = Math.min(ma, Math.max(remainingCap - saForExtra, 0));
      const extraBase = oaForExtra + saForExtra + maForExtra;

      const monthlyExtraRate = 0.01 / 12;
      const extraInterest = roundToCent(extraBase * monthlyExtraRate);

      if (age >= 55) {
        const secondTierBase = Math.min(extraBase, 30000);
        const thirdTierBase = Math.min(Math.max(extraBase - 30000, 0), 30000);
        const bonus55Interest = roundToCent(
          secondTierBase * (0.02 / 12) + thirdTierBase * (0.01 / 12),
        );

        const totalExtra = extraInterest + bonus55Interest;
        if (oaForExtra + saForExtra + maForExtra > 0) {
          const oaProportion = oaForExtra / (oaForExtra + saForExtra + maForExtra);
          const saProportion = saForExtra / (oaForExtra + saForExtra + maForExtra);
          const maProportion = maForExtra / (oaForExtra + saForExtra + maForExtra);
          oa = roundToCent(oa + totalExtra * oaProportion);
          sa = roundToCent(sa + totalExtra * saProportion);
          ma = roundToCent(ma + totalExtra * maProportion);
        }
      } else {
        if (oaForExtra + saForExtra + maForExtra > 0) {
          const oaProportion = oaForExtra / (oaForExtra + saForExtra + maForExtra);
          const saProportion = saForExtra / (oaForExtra + saForExtra + maForExtra);
          const maProportion = maForExtra / (oaForExtra + saForExtra + maForExtra);
          oa = roundToCent(oa + extraInterest * oaProportion);
          sa = roundToCent(sa + extraInterest * saProportion);
          ma = roundToCent(ma + extraInterest * maProportion);
        }
      }
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
