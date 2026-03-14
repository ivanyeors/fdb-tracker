/**
 * Singapore resident tax calculation engine.
 * Reference: docs/finance_tracking_dashboard_plan_v2.md §3.4
 */

import { getAge, calculateAnnualCpf } from "./cpf";
import {
  earnedIncomeRelief,
  cpfRelief,
  lifeInsuranceRelief,
} from "./tax-reliefs";

/** Progressive tax brackets (YA 2024 onwards) — chargeable income thresholds and rates */
const BRACKETS: Array<{ threshold: number; rate: number }> = [
  { threshold: 20000, rate: 0 },
  { threshold: 30000, rate: 0.02 },
  { threshold: 40000, rate: 0.035 },
  { threshold: 80000, rate: 0.07 },
  { threshold: 120000, rate: 0.115 },
  { threshold: 160000, rate: 0.15 },
  { threshold: 200000, rate: 0.18 },
  { threshold: 240000, rate: 0.19 },
  { threshold: 280000, rate: 0.195 },
  { threshold: 320000, rate: 0.2 },
  { threshold: 500000, rate: 0.22 },
  { threshold: 1000000, rate: 0.23 },
  { threshold: Infinity, rate: 0.24 },
];

const RELIEF_CAP = 80000;

/** YA2025 rebate: 60% capped at $200 */
const REBATE_2025 = { rate: 0.6, cap: 200 };

export type ReliefBreakdownItem = {
  type: string;
  amount: number;
  source: "auto" | "manual";
};

export type TaxResult = {
  chargeableIncome: number;
  taxPayable: number;
  reliefBreakdown: ReliefBreakdownItem[];
  effectiveRate: number;
  employmentIncome: number;
  totalReliefs: number;
};

export type ProfileForTax = {
  birth_year: number;
};

export type IncomeConfigForTax = {
  annual_salary: number;
  bonus_estimate: number;
};

export type InsurancePolicyForTax = {
  type: string;
  premium_amount: number;
  frequency: string;
  coverage_amount: number | null;
  is_active: boolean;
};

export type ManualReliefInput = {
  relief_type: string;
  amount: number;
};

function roundToCent(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Apply Singapore progressive tax brackets to chargeable income */
export function applyProgressiveBrackets(
  chargeableIncome: number,
  _year: number = 2026
): number {
  if (chargeableIncome <= 0) return 0;

  let tax = 0;
  let prevThreshold = 0;

  for (const { threshold, rate } of BRACKETS) {
    const bandStart = prevThreshold;
    const bandEnd = Math.min(chargeableIncome, threshold);
    if (bandEnd > bandStart) {
      tax += (bandEnd - bandStart) * rate;
    }
    if (chargeableIncome <= threshold) break;
    prevThreshold = threshold;
  }

  return roundToCent(tax);
}

/** Cap total reliefs at $80,000 */
export function capReliefs(totalReliefs: number): number {
  return Math.min(Math.max(0, totalReliefs), RELIEF_CAP);
}

/** Apply rebate (e.g. YA2025: 60% capped $200) */
export function applyRebate(taxPayable: number, year: number): number {
  if (year === 2025) {
    const rebate = Math.min(taxPayable * REBATE_2025.rate, REBATE_2025.cap);
    return roundToCent(Math.max(0, taxPayable - rebate));
  }
  return taxPayable;
}

/**
 * Get auto-derived reliefs from profile, income config, and insurance policies.
 * Implements: earned_income, cpf, life_insurance.
 */
export function getAutoReliefs(
  profile: ProfileForTax,
  incomeConfig: IncomeConfigForTax | null,
  insurancePolicies: InsurancePolicyForTax[],
  year: number = 2026
): { total: number; breakdown: ReliefBreakdownItem[] } {
  const breakdown: ReliefBreakdownItem[] = [];
  let total = 0;

  const age = getAge(profile.birth_year, year);
  const earnedIncome = earnedIncomeRelief(age);
  total += earnedIncome;
  breakdown.push({ type: "earned_income", amount: earnedIncome, source: "auto" });

  if (incomeConfig) {
    const { totalEmployee } = calculateAnnualCpf(
      incomeConfig.annual_salary,
      incomeConfig.bonus_estimate,
      age,
      year
    );
    const cpf = cpfRelief(totalEmployee);
    total += cpf;
    breakdown.push({ type: "cpf", amount: cpf, source: "auto" });

    const lifePolicies = insurancePolicies.filter(
      (p) =>
        p.is_active &&
        ["term_life", "whole_life", "endowment"].includes(p.type)
    );
    if (lifePolicies.length > 0) {
      const totalPremium = lifePolicies.reduce((sum, p) => {
        const annual = p.frequency === "monthly" ? p.premium_amount * 12 : p.premium_amount;
        return sum + annual;
      }, 0);
      const totalInsured = lifePolicies.reduce(
        (sum, p) => sum + (p.coverage_amount ?? 0),
        0
      );
      const life = lifeInsuranceRelief(totalPremium, cpf, totalInsured);
      total += life;
      breakdown.push({ type: "life_insurance", amount: life, source: "auto" });
    }
  }

  return { total: roundToCent(total), breakdown };
}

/**
 * Calculate tax for a profile.
 */
export function calculateTax(params: {
  profile: ProfileForTax;
  incomeConfig: IncomeConfigForTax | null;
  insurancePolicies: InsurancePolicyForTax[];
  manualReliefs: ManualReliefInput[];
  year?: number;
}): TaxResult {
  const year = params.year ?? new Date().getFullYear();
  const employmentIncome =
    (params.incomeConfig?.annual_salary ?? 0) +
    (params.incomeConfig?.bonus_estimate ?? 0);

  const { total: autoTotal, breakdown: autoBreakdown } = getAutoReliefs(
    params.profile,
    params.incomeConfig,
    params.insurancePolicies,
    year
  );

  const manualTotal = params.manualReliefs.reduce((s, r) => s + r.amount, 0);
  const manualBreakdown: ReliefBreakdownItem[] = params.manualReliefs.map(
    (r) => ({ type: r.relief_type, amount: r.amount, source: "manual" })
  );

  const totalReliefs = capReliefs(autoTotal + manualTotal);
  const chargeableIncome = Math.max(0, employmentIncome - totalReliefs);
  let taxPayable = applyProgressiveBrackets(chargeableIncome, year);
  taxPayable = applyRebate(taxPayable, year);

  const effectiveRate =
    employmentIncome > 0 ? (taxPayable / employmentIncome) * 100 : 0;

  return {
    chargeableIncome: roundToCent(chargeableIncome),
    taxPayable,
    reliefBreakdown: [...autoBreakdown, ...manualBreakdown],
    effectiveRate: roundToCent(effectiveRate),
    employmentIncome,
    totalReliefs,
  };
}
