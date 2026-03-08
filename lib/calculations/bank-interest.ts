export type Ocbc360Config = {
  salaryMet: boolean;
  saveMet: boolean;
  spendMet: boolean;
  insureMet: boolean;
  investMet: boolean;
  growMet: boolean;
};

export type InterestBreakdown = {
  category: string;
  first75k: number;
  next25k: number;
  rate75k: number;
  rate25k: number;
  met: boolean;
};

export type Ocbc360InterestResult = {
  balance: number;
  annualRate: number;
  monthlyInterest: number;
  annualInterest: number;
  breakdown: InterestBreakdown[];
};

type RateEntry = {
  category: string;
  rate75k: number;
  rate25k: number;
  configKey: keyof Ocbc360Config;
  alwaysMet?: boolean;
  autoGrow?: boolean;
};

const OCBC_360_RATES: RateEntry[] = [
  { category: "Base", rate75k: 0.0005, rate25k: 0.0005, configKey: "salaryMet", alwaysMet: true },
  { category: "Salary", rate75k: 0.016, rate25k: 0.032, configKey: "salaryMet" },
  { category: "Save", rate75k: 0.006, rate25k: 0.012, configKey: "saveMet" },
  { category: "Spend", rate75k: 0.005, rate25k: 0.005, configKey: "spendMet" },
  { category: "Insure", rate75k: 0.012, rate25k: 0.024, configKey: "insureMet" },
  { category: "Invest", rate75k: 0.012, rate25k: 0.024, configKey: "investMet" },
  { category: "Grow", rate75k: 0.022, rate25k: 0.022, configKey: "growMet", autoGrow: true },
];

export function calculateOcbc360Interest(
  balance: number,
  config: Ocbc360Config,
): Ocbc360InterestResult {
  const first75kAmount = Math.min(balance, 75_000);
  const next25kAmount = Math.max(0, Math.min(balance - 75_000, 25_000));

  const effectiveConfig: Ocbc360Config = {
    ...config,
    growMet: balance > 250_000,
  };

  const breakdown: InterestBreakdown[] = [];
  let annualInterest = 0;

  for (const entry of OCBC_360_RATES) {
    const met = entry.alwaysMet === true || effectiveConfig[entry.configKey];
    const first75k = met ? first75kAmount * entry.rate75k : 0;
    const next25k = met ? next25kAmount * entry.rate25k : 0;

    breakdown.push({
      category: entry.category,
      first75k,
      next25k,
      rate75k: entry.rate75k,
      rate25k: entry.rate25k,
      met,
    });

    annualInterest += first75k + next25k;
  }

  const monthlyInterest = annualInterest / 12;
  const annualRate = balance > 0 ? annualInterest / balance : 0;

  return {
    balance,
    annualRate,
    monthlyInterest,
    annualInterest,
    breakdown,
  };
}

export function calculateSimpleInterest(
  balance: number,
  annualRatePct: number,
): { monthlyInterest: number; annualInterest: number } {
  const annualInterest = balance * (annualRatePct / 100);
  return {
    monthlyInterest: annualInterest / 12,
    annualInterest,
  };
}

export function getOcbc360EffectiveRate(
  config: Ocbc360Config,
): { first75kRate: number; next25kRate: number } {
  let first75kRate = 0;
  let next25kRate = 0;

  for (const entry of OCBC_360_RATES) {
    const met = entry.alwaysMet === true || config[entry.configKey];
    if (met) {
      first75kRate += entry.rate75k;
      next25kRate += entry.rate25k;
    }
  }

  return { first75kRate, next25kRate };
}
