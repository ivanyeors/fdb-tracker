/** Balance at or above this amount qualifies for the Grow bonus (aligned with OCBC 360 tier). */
export const OCBC_GROW_BALANCE_THRESHOLD = 250_000;

/**
 * OCBC 360 bonus interest is typically applied in two balance slices: first S$75,000 and next
 * S$25,000 (often at a higher rate per category). Total bonus-bearing balance is therefore
 * up to S$100,000 for those category bonuses; balance above that does not earn the same
 * category bonus rates in this projection (see bank terms for base interest on full balance).
 */
export const OCBC_BONUS_FIRST_TIER_CAP = 75_000;
export const OCBC_BONUS_SECOND_TIER_CAP = 25_000;
export const OCBC_BONUS_INTEREST_BALANCE_CAP =
  OCBC_BONUS_FIRST_TIER_CAP + OCBC_BONUS_SECOND_TIER_CAP;

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
  const first75kAmount = Math.min(balance, OCBC_BONUS_FIRST_TIER_CAP);
  const next25kAmount = Math.max(
    0,
    Math.min(balance - OCBC_BONUS_FIRST_TIER_CAP, OCBC_BONUS_SECOND_TIER_CAP),
  );

  const effectiveConfig: Ocbc360Config = {
    ...config,
    growMet: balance >= OCBC_GROW_BALANCE_THRESHOLD,
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
