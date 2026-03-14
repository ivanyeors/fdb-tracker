/**
 * Individual Singapore tax relief calculators.
 * Reference: docs/finance_tracking_dashboard_plan_v2.md §3.4
 */

/** Earned Income Relief: $1,000 (≤54), $6,000 (55–59), $8,000 (60+) */
export function earnedIncomeRelief(age: number): number {
  if (age <= 54) return 1000;
  if (age <= 59) return 6000;
  return 8000;
}

/** CPF (employee) relief — full employee CPF contribution is tax-deductible */
export function cpfRelief(employeeCpfAnnual: number): number {
  return Math.max(0, employeeCpfAnnual);
}

/**
 * Life Insurance relief: lower of ($5,000 − CPF relief) or 7% of insured sum.
 * CPF relief reduces the $5k cap. For policies: term_life, whole_life, endowment.
 */
export function lifeInsuranceRelief(
  totalLifePremiumAnnual: number,
  cpfReliefAmount: number,
  totalInsuredSum: number
): number {
  const capAfterCpf = Math.max(0, 5000 - cpfReliefAmount);
  const sevenPctOfSum = totalInsuredSum * 0.07;
  const cap = Math.min(capAfterCpf, sevenPctOfSum);
  return Math.min(totalLifePremiumAnnual, cap);
}

/** SRS relief — up to $15,300 (citizen/PR). Stub for future implementation. */
export function srsRelief(contribution: number): number {
  return Math.min(Math.max(0, contribution), 15300);
}

/** NSman relief — Self $1,500–$5,000; Wife $750; Parent $750–$3,500. Stub. */
export function nsmanRelief(_status: { self?: number; wife?: number; parent?: number }): number {
  return 0;
}

/** Parent relief — $5,500–$9,000 per parent, max 2. Stub. */
export function parentRelief(_parents: Array<{ amount: number }>): number {
  return 0;
}

/** Spouse relief — $2,000 when spouse income < $4k. Stub. */
export function spouseRelief(_spouseIncome: number): number {
  return 0;
}

/** WMCR — Working mother relief. Stub. */
export function wmcrRelief(_children: Array<{ amount: number }>): number {
  return 0;
}

/** Course fees relief — up to $5,500. Stub. */
export function courseFeeRelief(fees: number): number {
  return Math.min(Math.max(0, fees), 5500);
}

/** Donation relief — 250% deduction for IPC donations. Stub. */
export function donationRelief(amount: number): number {
  return Math.max(0, amount) * 2.5;
}
