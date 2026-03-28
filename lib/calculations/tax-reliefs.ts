/**
 * Individual Singapore tax relief calculators.
 * Reference: IRAS YA 2025+ tax relief rules.
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

/** SRS relief — up to $15,300 (citizen/PR). */
export function srsRelief(contribution: number): number {
  return Math.min(Math.max(0, contribution), 15300);
}

/**
 * NSman relief — manual entry amounts summed.
 * Self: $1,500–$5,000; Wife: $750; Parent: $750–$3,500.
 */
export function nsmanRelief(status: {
  self?: number;
  wife?: number;
  parent?: number;
}): number {
  return (
    Math.max(0, status.self ?? 0) +
    Math.max(0, status.wife ?? 0) +
    Math.max(0, status.parent ?? 0)
  );
}

/** Spouse relief — $2,000 when spouse income < $8,000 (YA 2025+ threshold). */
export function spouseRelief(spouseIncome: number): number {
  if (spouseIncome < 8000) return 2000;
  return 0;
}

/** Handicapped spouse relief — $5,500 (no income threshold). */
export function handicappedSpouseRelief(): number {
  return 5500;
}

export type ChildForRelief = {
  birthYear: number;
  birthOrder: number;
  annualIncome: number;
  inFullTimeEducation: boolean;
  isHandicapped: boolean;
};

/**
 * Per-child QCR amount based on IRAS rules.
 * Born on/after 2024: 1st $8k, 2nd $10k, 3rd+ $12k.
 * Born before 2024: $4k each.
 * Handicapped child: $7,500 (replaces standard QCR).
 */
function qcrAmountForChild(child: ChildForRelief, year: number): number {
  const age = year - child.birthYear;
  if (age >= 16 && !child.inFullTimeEducation && !child.isHandicapped) return 0;
  if (child.annualIncome >= 8000 && !child.isHandicapped) return 0;

  if (child.isHandicapped) return 7500;

  if (child.birthYear >= 2024) {
    if (child.birthOrder === 1) return 8000;
    if (child.birthOrder === 2) return 10000;
    return 12000;
  }
  return 4000;
}

/**
 * Qualifying Child Relief (QCR) — per-child amounts for all qualifying children.
 * Returns per-child QCR amounts (needed for WMCR cap calculation) and total.
 */
export function qualifyingChildRelief(
  children: ChildForRelief[],
  year: number
): { perChild: number[]; total: number } {
  const perChild = children.map((c) => qcrAmountForChild(c, year));
  const total = perChild.reduce((s, a) => s + a, 0);
  return { perChild, total };
}

/**
 * Working Mother's Child Relief (WMCR).
 * Born on/after 2024: fixed $8k/$10k/$12k by birth order.
 * Born before 2024: 15%/20%/25% of mother's earned income by birth order.
 * Per-child cap: QCR + WMCR <= $50,000.
 */
export function wmcrRelief(
  children: ChildForRelief[],
  motherEarnedIncome: number,
  qcrPerChild: number[],
  year: number
): { perChild: number[]; total: number } {
  const PER_CHILD_CAP = 50000;
  const perChild = children.map((child, i) => {
    const age = year - child.birthYear;
    if (age >= 16 && !child.inFullTimeEducation && !child.isHandicapped) return 0;
    if (child.annualIncome >= 8000 && !child.isHandicapped) return 0;

    let raw: number;
    if (child.birthYear >= 2024) {
      if (child.birthOrder === 1) raw = 8000;
      else if (child.birthOrder === 2) raw = 10000;
      else raw = 12000;
    } else {
      const pct =
        child.birthOrder === 1
          ? 0.15
          : child.birthOrder === 2
            ? 0.2
            : 0.25;
      raw = motherEarnedIncome * pct;
    }

    const qcr = qcrPerChild[i] ?? 0;
    return Math.max(0, Math.min(raw, PER_CHILD_CAP - qcr));
  });

  const total = perChild.reduce((s, a) => s + a, 0);
  return { perChild, total };
}

export type ParentForRelief = {
  livingWithClaimant: boolean;
  annualIncome: number;
  isHandicapped: boolean;
};

/**
 * Parent / Handicapped Parent relief.
 * Normal: $9,000 (living with) / $5,500 (not living with). Max 2.
 * Handicapped: $14,000 (living with) / $10,000 (not living with). Max 2.
 * Parent income must be < $8,000 (unless handicapped).
 */
export function parentRelief(parents: ParentForRelief[]): number {
  let total = 0;
  const eligible = parents.slice(0, 2);
  for (const p of eligible) {
    if (p.annualIncome >= 8000 && !p.isHandicapped) continue;

    if (p.isHandicapped) {
      total += p.livingWithClaimant ? 14000 : 10000;
    } else {
      total += p.livingWithClaimant ? 9000 : 5500;
    }
  }
  return total;
}

/** Course fees relief — up to $5,500. */
export function courseFeeRelief(fees: number): number {
  return Math.min(Math.max(0, fees), 5500);
}

/** Donation relief — 250% deduction for IPC donations. */
export function donationRelief(amount: number): number {
  return Math.max(0, amount) * 2.5;
}
