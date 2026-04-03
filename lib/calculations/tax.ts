/**
 * Singapore resident tax calculation engine.
 * Reference: docs/finance_tracking_dashboard_plan_v2.md §3.4
 */

import { getAge, calculateAnnualCpf } from "./cpf";
import {
  earnedIncomeRelief,
  cpfRelief,
  lifeInsuranceRelief,
  donationRelief,
  courseFeeRelief,
  srsRelief,
  spouseRelief as calcSpouseRelief,
  qualifyingChildRelief,
  wmcrRelief as calcWmcrRelief,
  parentRelief as calcParentRelief,
  type ChildForRelief,
  type ParentForRelief,
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

/** One progressive tax band with income charged and tax attributable to that slice */
export type ProgressiveBracketBand = {
  bandFrom: number;
  bandTo: number;
  rate: number;
  incomeInBand: number;
  taxInBand: number;
};

export type TaxResult = {
  chargeableIncome: number;
  taxPayable: number;
  taxBeforeRebate: number;
  rebateAmount: number;
  reliefBreakdown: ReliefBreakdownItem[];
  effectiveRate: number;
  employmentIncome: number;
  /** Reliefs after $80k cap — used for chargeable income */
  totalReliefs: number;
  /** Sum of auto + manual reliefs before cap (for cap headroom hints) */
  reliefsRawTotal: number;
  /** Additional relief amount that could still count, up to $80k total */
  reliefCapHeadroom: number;
  bracketAllocation: ProgressiveBracketBand[];
  /** Marginal rate on the last dollar of chargeable income */
  marginalRate: number;
  /** Lower bound of the marginal band */
  marginalBandFrom: number;
  /** Upper chargeable-income bound of the marginal band (null if unbounded in table) */
  marginalBandTo: number | null;
};

export type ProfileForTax = {
  birth_year: number;
  gender?: "male" | "female" | null;
  spouse_profile_id?: string | null;
  marital_status?: string | null;
};

export type SpouseForTax = {
  annual_income: number;
};

export type DependentForTax = {
  name: string;
  birth_year: number;
  relationship: "child" | "parent" | "grandparent";
  annual_income: number;
  in_full_time_education: boolean;
  living_with_claimant: boolean;
  is_handicapped: boolean;
  claimed_by_profile_id: string | null;
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

/** Apply relief formula per type — donations 250%, course_fees capped, etc. (same as persisted tax) */
export function countedManualReliefForType(
  reliefType: string,
  amount: number
): number {
  switch (reliefType) {
    case "donations":
      return donationRelief(amount);
    case "course_fees":
      return courseFeeRelief(amount);
    case "srs":
      return srsRelief(amount);
    case "cpf_topup_self":
    case "cpf_topup_family":
      return Math.max(0, Math.min(amount, 8000));
    case "spouse":
      return Math.max(0, Math.min(amount, 2000));
    case "donations_employer":
      // Employer-channeled donations — already at deduction value, no 250% multiplier
      return Math.max(0, amount);
    case "cpf":
      // Manual CPF override (e.g. from NOA import) — pass through as-is
      return Math.max(0, amount);
    case "life_insurance":
      // Manual life insurance override — pass through
      return Math.max(0, amount);
    case "qcr":
    case "wmcr":
    case "parent":
    case "nsman":
    case "other":
    default:
      return Math.max(0, amount);
  }
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

/** Per-band allocation of chargeable income; taxInBand sums to applyProgressiveBrackets(ci). */
export function getProgressiveBracketAllocation(
  chargeableIncome: number,
  _year: number = 2026
): ProgressiveBracketBand[] {
  if (chargeableIncome <= 0) return [];

  const bands: ProgressiveBracketBand[] = [];
  let prevThreshold = 0;

  for (const { threshold, rate } of BRACKETS) {
    const bandFrom = prevThreshold;
    const sliceTop = Math.min(chargeableIncome, threshold);
    const incomeInBand =
      sliceTop > bandFrom ? roundToCent(sliceTop - bandFrom) : 0;

    if (incomeInBand > 0) {
      bands.push({
        bandFrom,
        bandTo: threshold === Infinity ? Number.POSITIVE_INFINITY : threshold,
        rate,
        incomeInBand,
        taxInBand: roundToCent(incomeInBand * rate),
      });
    }
    if (chargeableIncome <= threshold) break;
    prevThreshold = threshold;
  }

  return bands;
}

/**
 * One row of the resident progressive schedule clipped to [0, axisMax], for ladder UI.
 * Schedule matches IRAS resident graduated rates (YA 2024+; same structure as `BRACKETS`).
 */
export type ResidentBracketChartLayer = {
  bandFrom: number;
  bandTo: number;
  rate: number;
  /** Dollar width of this slice on the chart axis */
  widthDollars: number;
};

const TAX_LADDER_AXIS_MIN = 500_000;

/** Chargeable income dollars that fall in [layerFrom, layerTo). */
export function chargeableIncomeInLayer(
  chargeableIncome: number,
  layerFrom: number,
  layerTo: number
): number {
  if (chargeableIncome <= layerFrom) return 0;
  return roundToCent(Math.min(chargeableIncome, layerTo) - layerFrom);
}

/** Axis end ($) so the bar shows the full bracket ladder, not only income earned. */
export function resolveTaxBracketChartAxisMaxDollars(params: {
  chargeableIncome: number;
  otherChargeableIncomes?: number[];
}): number {
  const others = params.otherChargeableIncomes ?? [];
  const raw = Math.max(
    TAX_LADDER_AXIS_MIN,
    Math.max(0, params.chargeableIncome),
    ...others.map((x) => Math.max(0, x))
  );
  const headroom = Math.max(raw * 0.04, 25_000);
  const padded = Math.ceil((raw + headroom) / 10_000) * 10_000;
  return Math.min(padded, 9_000_000);
}

/** Full resident bracket slices from $0 up to `axisMaxDollars` (partial top band if capped). */
export function getResidentBracketChartLayers(
  axisMaxDollars: number
): ResidentBracketChartLayer[] {
  if (axisMaxDollars <= 0) return [];

  const layers: ResidentBracketChartLayer[] = [];
  let prevThreshold = 0;

  for (const { threshold, rate } of BRACKETS) {
    const bandFrom = prevThreshold;
    const sliceTop = Math.min(axisMaxDollars, threshold);
    const widthDollars =
      sliceTop > bandFrom ? roundToCent(sliceTop - bandFrom) : 0;

    if (widthDollars > 0) {
      layers.push({
        bandFrom,
        bandTo: sliceTop,
        rate,
        widthDollars,
      });
    }
    if (axisMaxDollars <= threshold) break;
    prevThreshold = threshold;
  }

  return layers;
}

/** Marginal bracket: rate on the top dollar of chargeable income */
export function getMarginalBracketInfo(chargeableIncome: number): {
  marginalRate: number;
  marginalBandFrom: number;
  marginalBandTo: number | null;
} {
  if (chargeableIncome <= 0) {
    return { marginalRate: 0, marginalBandFrom: 0, marginalBandTo: null };
  }
  const bands = getProgressiveBracketAllocation(chargeableIncome);
  const last = bands[bands.length - 1];
  if (!last) {
    return { marginalRate: 0, marginalBandFrom: 0, marginalBandTo: null };
  }
  return {
    marginalRate: last.rate,
    marginalBandFrom: last.bandFrom,
    marginalBandTo: Number.isFinite(last.bandTo) ? last.bandTo : null,
  };
}

/** Cap total reliefs at $80,000 */
export function capReliefs(totalReliefs: number): number {
  return Math.min(Math.max(0, totalReliefs), RELIEF_CAP);
}

/**
 * Chargeable income if extra *counted* relief (after per-type formulas) were added
 * on top of current reliefsRawTotal, then $80k cap applied.
 */
export function previewChargeableAfterExtraCountedRelief(params: {
  employmentIncome: number;
  reliefsRawTotal: number;
  extraCountedRelief: number;
}): number {
  const added = roundToCent(Math.max(0, params.extraCountedRelief));
  const newRaw = roundToCent(params.reliefsRawTotal + added);
  const totalReliefs = capReliefs(newRaw);
  return roundToCent(Math.max(0, params.employmentIncome - totalReliefs));
}

/** Tax deltas when chargeable income moves (rebate rules for `year` applied). */
export function taxDeltaFromLowerChargeableIncome(params: {
  chargeableBefore: number;
  chargeableAfter: number;
  year: number;
}): { taxBeforeRebateDelta: number; taxPayableDelta: number } {
  const before = Math.max(0, params.chargeableBefore);
  const after = Math.max(0, params.chargeableAfter);
  const tbBefore = applyProgressiveBrackets(before, params.year);
  const tbAfter = applyProgressiveBrackets(after, params.year);
  const rebateBefore = getRebateAmount(tbBefore, params.year);
  const rebateAfter = getRebateAmount(tbAfter, params.year);
  const payBefore = roundToCent(Math.max(0, tbBefore - rebateBefore));
  const payAfter = roundToCent(Math.max(0, tbAfter - rebateAfter));
  return {
    taxBeforeRebateDelta: roundToCent(tbBefore - tbAfter),
    taxPayableDelta: roundToCent(payBefore - payAfter),
  };
}

/** Rebate dollars for the year (0 if no rebate rule) */
export function getRebateAmount(taxBeforeRebate: number, year: number): number {
  if (year === 2025) {
    return roundToCent(
      Math.min(taxBeforeRebate * REBATE_2025.rate, REBATE_2025.cap)
    );
  }
  return 0;
}

/** Apply rebate (e.g. YA2025: 60% capped $200) */
export function applyRebate(taxPayable: number, year: number): number {
  const rebate = getRebateAmount(taxPayable, year);
  return roundToCent(Math.max(0, taxPayable - rebate));
}

/**
 * Get auto-derived reliefs from profile, income config, insurance policies,
 * spouse data, and dependents. Implements: earned_income, cpf, life_insurance,
 * spouse, qcr, wmcr, parent.
 */
export function getAutoReliefs(
  profile: ProfileForTax,
  incomeConfig: IncomeConfigForTax | null,
  insurancePolicies: InsurancePolicyForTax[],
  year: number = 2026,
  options?: {
    profileId?: string;
    spouse?: SpouseForTax | null;
    dependents?: DependentForTax[];
    manualReliefTypes?: Set<string>;
  }
): { total: number; breakdown: ReliefBreakdownItem[] } {
  const breakdown: ReliefBreakdownItem[] = [];
  let total = 0;
  const manualTypes = options?.manualReliefTypes ?? new Set();

  const age = getAge(profile.birth_year, year);
  const earnedIncome = earnedIncomeRelief(age);
  total += earnedIncome;
  breakdown.push({ type: "earned_income", amount: earnedIncome, source: "auto" });

  // CPF relief — skip auto-calc when user has manual override (e.g. from NOA import)
  let autoCpfAmount = 0;
  if (!manualTypes.has("cpf") && incomeConfig) {
    const { totalEmployee } = calculateAnnualCpf(
      incomeConfig.annual_salary,
      incomeConfig.bonus_estimate,
      age,
      year
    );
    autoCpfAmount = cpfRelief(totalEmployee);
    total += autoCpfAmount;
    breakdown.push({ type: "cpf", amount: autoCpfAmount, source: "auto" });
  }

  // Life insurance relief — skip when manual override exists
  if (!manualTypes.has("life_insurance") && incomeConfig) {
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
      // Use manual CPF amount if overridden, otherwise auto-calculated
      const cpfForLifeCap = manualTypes.has("cpf") ? 0 : autoCpfAmount;
      const life = lifeInsuranceRelief(totalPremium, cpfForLifeCap, totalInsured);
      total += life;
      breakdown.push({ type: "life_insurance", amount: life, source: "auto" });
    }
  }

  // Spouse relief — auto-derive if married + spouse data + no manual override
  if (
    !manualTypes.has("spouse") &&
    profile.marital_status === "married" &&
    options?.spouse
  ) {
    const sr = calcSpouseRelief(options.spouse.annual_income);
    if (sr > 0) {
      total += sr;
      breakdown.push({ type: "spouse", amount: sr, source: "auto" });
    }
  }

  // Child reliefs — QCR and WMCR from dependents
  const profileId = options?.profileId;
  const dependents = options?.dependents ?? [];
  const children = dependents
    .filter((d) => d.relationship === "child" && d.claimed_by_profile_id === profileId)
    .sort((a, b) => a.birth_year - b.birth_year);

  if (children.length > 0 && profileId) {
    const childrenForRelief: ChildForRelief[] = children.map((c, i) => ({
      birthYear: c.birth_year,
      birthOrder: i + 1,
      annualIncome: c.annual_income,
      inFullTimeEducation: c.in_full_time_education,
      isHandicapped: c.is_handicapped,
    }));

    // QCR
    if (!manualTypes.has("qcr")) {
      const qcr = qualifyingChildRelief(childrenForRelief, year);
      if (qcr.total > 0) {
        total += qcr.total;
        breakdown.push({ type: "qcr", amount: qcr.total, source: "auto" });
      }

      // WMCR — only for working mothers
      if (
        !manualTypes.has("wmcr") &&
        profile.gender === "female" &&
        incomeConfig
      ) {
        const motherIncome = incomeConfig.annual_salary + incomeConfig.bonus_estimate;
        const wmcr = calcWmcrRelief(childrenForRelief, motherIncome, qcr.perChild, year);
        if (wmcr.total > 0) {
          total += wmcr.total;
          breakdown.push({ type: "wmcr", amount: wmcr.total, source: "auto" });
        }
      }
    }
  }

  // Parent relief — from parent/grandparent dependents claimed by this profile
  if (!manualTypes.has("parent") && profileId) {
    const parents: ParentForRelief[] = dependents
      .filter(
        (d) =>
          (d.relationship === "parent" || d.relationship === "grandparent") &&
          d.claimed_by_profile_id === profileId
      )
      .map((d) => ({
        livingWithClaimant: d.living_with_claimant,
        annualIncome: d.annual_income,
        isHandicapped: d.is_handicapped,
      }));

    if (parents.length > 0) {
      const pr = calcParentRelief(parents);
      if (pr > 0) {
        total += pr;
        breakdown.push({ type: "parent", amount: pr, source: "auto" });
      }
    }
  }

  return { total: roundToCent(total), breakdown };
}

/**
 * Calculate tax for a profile.
 */
export function calculateTax(params: {
  profile: ProfileForTax;
  profileId?: string;
  incomeConfig: IncomeConfigForTax | null;
  insurancePolicies: InsurancePolicyForTax[];
  manualReliefs: ManualReliefInput[];
  spouse?: SpouseForTax | null;
  dependents?: DependentForTax[];
  year?: number;
}): TaxResult {
  const year = params.year ?? new Date().getFullYear();
  const employmentIncome =
    (params.incomeConfig?.annual_salary ?? 0) +
    (params.incomeConfig?.bonus_estimate ?? 0);

  const manualReliefTypes = new Set(params.manualReliefs.map((r) => r.relief_type));

  const { total: autoTotal, breakdown: autoBreakdown } = getAutoReliefs(
    params.profile,
    params.incomeConfig,
    params.insurancePolicies,
    year,
    {
      profileId: params.profileId,
      spouse: params.spouse,
      dependents: params.dependents,
      manualReliefTypes,
    }
  );

  const manualTotal = params.manualReliefs.reduce(
    (s, r) => s + countedManualReliefForType(r.relief_type, r.amount),
    0
  );
  const manualBreakdown: ReliefBreakdownItem[] = params.manualReliefs.map(
    (r) => ({
      type: r.relief_type,
      amount: countedManualReliefForType(r.relief_type, r.amount),
      source: "manual",
    })
  );

  const reliefsRawTotal = roundToCent(autoTotal + manualTotal);
  const totalReliefs = capReliefs(reliefsRawTotal);
  const chargeableIncome = Math.max(0, employmentIncome - totalReliefs);
  const taxBeforeRebate = applyProgressiveBrackets(chargeableIncome, year);
  const rebateAmount = getRebateAmount(taxBeforeRebate, year);
  const taxPayable = roundToCent(Math.max(0, taxBeforeRebate - rebateAmount));

  const effectiveRate =
    employmentIncome > 0 ? (taxPayable / employmentIncome) * 100 : 0;

  const bracketAllocation = getProgressiveBracketAllocation(
    chargeableIncome,
    year
  );
  const {
    marginalRate,
    marginalBandFrom,
    marginalBandTo,
  } = getMarginalBracketInfo(chargeableIncome);
  const reliefCapHeadroom = roundToCent(
    Math.max(0, RELIEF_CAP - reliefsRawTotal)
  );

  return {
    chargeableIncome: roundToCent(chargeableIncome),
    taxPayable,
    taxBeforeRebate,
    rebateAmount,
    reliefBreakdown: [...autoBreakdown, ...manualBreakdown],
    effectiveRate: roundToCent(effectiveRate),
    employmentIncome,
    totalReliefs,
    reliefsRawTotal,
    reliefCapHeadroom,
    bracketAllocation,
    marginalRate,
    marginalBandFrom,
    marginalBandTo,
  };
}

const TAX_MATCH_EPS = 0.01;
const BONUS_SEARCH_DEFAULT_MAX = 10_000_000;
const BONUS_SEARCH_MAX_EXPAND_STEPS = 30;
const BONUS_SEARCH_MAX_ITER = 70;

export type SolveBonusForTargetPayableResult =
  | { ok: true; bonus_estimate: number }
  | { ok: false; error: string };

/**
 * Find non-negative bonus_estimate such that calculateTax(...).taxPayable ≈ targetPayable,
 * holding salary and reliefs fixed. Uses binary search (tax payable increases with bonus).
 */
export function solveBonusForTargetTaxPayable(params: {
  profile: ProfileForTax;
  annual_salary: number;
  insurancePolicies: InsurancePolicyForTax[];
  manualReliefs: ManualReliefInput[];
  year: number;
  targetPayable: number;
  bonusUpperBound?: number;
}): SolveBonusForTargetPayableResult {
  const targetPayable = roundToCent(Math.max(0, params.targetPayable));

  const taxAt = (bonus: number) =>
    calculateTax({
      profile: params.profile,
      incomeConfig: {
        annual_salary: params.annual_salary,
        bonus_estimate: bonus,
      },
      insurancePolicies: params.insurancePolicies,
      manualReliefs: params.manualReliefs,
      year: params.year,
    }).taxPayable;

  const taxAtZero = taxAt(0);
  if (targetPayable + TAX_MATCH_EPS < taxAtZero) {
    return {
      ok: false,
      error:
        "Target tax is lower than this model with zero bonus—reduce annual salary or add reliefs in Manual reliefs.",
    };
  }

  if (Math.abs(targetPayable - taxAtZero) <= TAX_MATCH_EPS) {
    return { ok: true, bonus_estimate: 0 };
  }

  let low = 0;
  let high = params.bonusUpperBound ?? BONUS_SEARCH_DEFAULT_MAX;
  let taxHigh = taxAt(high);
  let expandStep = 0;
  while (taxHigh + TAX_MATCH_EPS < targetPayable && expandStep < BONUS_SEARCH_MAX_EXPAND_STEPS) {
    high *= 2;
    taxHigh = taxAt(high);
    expandStep++;
  }

  if (taxHigh + TAX_MATCH_EPS < targetPayable) {
    return {
      ok: false,
      error:
        "Target tax is too high to match by increasing bonus within limits—check the monthly amount or instalment count.",
    };
  }

  for (let i = 0; i < BONUS_SEARCH_MAX_ITER; i++) {
    const mid = (low + high) / 2;
    const t = taxAt(mid);
    if (Math.abs(t - targetPayable) <= TAX_MATCH_EPS) {
      return { ok: true, bonus_estimate: roundToCent(mid) };
    }
    if (t < targetPayable) low = mid;
    else high = mid;
    if (high - low < 0.005) break;
  }

  const candidateLow = roundToCent(low);
  const candidateHigh = roundToCent(high);
  const candidates = [candidateLow, candidateHigh, roundToCent((low + high) / 2)];
  let best = candidateLow;
  let bestDiff = Math.abs(taxAt(candidateLow) - targetPayable);
  for (const b of candidates) {
    const d = Math.abs(taxAt(b) - targetPayable);
    if (d < bestDiff) {
      bestDiff = d;
      best = b;
    }
  }

  if (bestDiff <= TAX_MATCH_EPS * 2) {
    return { ok: true, bonus_estimate: best };
  }

  return {
    ok: false,
    error:
      "Could not converge on a bonus estimate for this target tax—try entering annual tax directly under Enter IRAS actual.",
  };
}

/** IRAS-style bracket summary line */
export type IrasBracketSummaryLine = {
  label: string;
  tax: number;
};

/**
 * Collapse bracket allocation into IRAS NOA display format.
 * Merges all fully-consumed bands into "First $X → $Y",
 * then shows the partial band as "Next $Z @ R% → $W".
 *
 * Example: For chargeable income $56,350:
 *   "First $40,000" → $550
 *   "Next $16,350 @ 7%" → $1,144.50
 */
export function getIrasStyleBracketSummary(
  bracketAllocation: ProgressiveBracketBand[]
): IrasBracketSummaryLine[] {
  if (bracketAllocation.length === 0) return [];

  const result: IrasBracketSummaryLine[] = [];

  // Find the last fully-filled band
  let lastFullIndex = -1;
  for (let i = 0; i < bracketAllocation.length; i++) {
    const band = bracketAllocation[i];
    const bandWidth = (Number.isFinite(band.bandTo) ? band.bandTo : Infinity) - band.bandFrom;
    if (band.incomeInBand >= bandWidth - 0.01) {
      lastFullIndex = i;
    }
  }

  if (lastFullIndex >= 0) {
    // "First $X" — collapse all fully-filled bands
    let cumulativeIncome = 0;
    let cumulativeTax = 0;
    for (let i = 0; i <= lastFullIndex; i++) {
      cumulativeIncome += bracketAllocation[i].incomeInBand;
      cumulativeTax += bracketAllocation[i].taxInBand;
    }
    result.push({
      label: `First ${formatBracketAmount(cumulativeIncome)}`,
      tax: roundToCent(cumulativeTax),
    });

    // "Next $Y @ Z%" — the partial band after fully-filled ones
    if (lastFullIndex < bracketAllocation.length - 1) {
      const partial = bracketAllocation[lastFullIndex + 1];
      result.push({
        label: `Next ${formatBracketAmount(partial.incomeInBand)} @ ${formatBracketRate(partial.rate)}`,
        tax: roundToCent(partial.taxInBand),
      });
    }
  } else {
    // No fully-filled band — all income is in first partial band
    const band = bracketAllocation[0];
    if (band.rate === 0) {
      result.push({
        label: `First ${formatBracketAmount(band.incomeInBand)}`,
        tax: 0,
      });
    } else {
      result.push({
        label: `Next ${formatBracketAmount(band.incomeInBand)} @ ${formatBracketRate(band.rate)}`,
        tax: roundToCent(band.taxInBand),
      });
    }
  }

  return result;
}

function formatBracketAmount(amount: number): string {
  return amount.toLocaleString("en-SG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatBracketRate(rate: number): string {
  const pct = rate * 100;
  return pct % 1 === 0 ? `${pct}%` : `${pct.toFixed(1)}%`
}

/**
 * Back-calculate chargeable income from tax payable amount.
 * Inverse of applyProgressiveBrackets(): given tax, find the chargeable income.
 * Deterministic — walks brackets, no binary search needed.
 */
export function chargeableIncomeFromTax(
  taxPayable: number,
  year: number = 2026
): number {
  if (taxPayable <= 0) return 0;

  // First undo any rebate to get tax before rebate
  let taxBeforeRebate = taxPayable;
  if (year === 2025) {
    // Rebate: min(tax * 0.6, 200), so taxPayable = taxBefore - rebate
    // If taxPayable >= taxBefore - 200, rebate was capped at 200
    // taxBefore = taxPayable + min(taxBefore * 0.6, 200)
    // Case 1: rebate = taxBefore * 0.6 → taxPayable = taxBefore * 0.4 → taxBefore = taxPayable / 0.4
    // Case 2: rebate = 200 → taxBefore = taxPayable + 200
    const candidate1 = taxPayable / 0.4;
    const candidate2 = taxPayable + 200;
    // If candidate1's rebate <= 200, use it. Otherwise capped.
    if (candidate1 * 0.6 <= 200 + 0.01) {
      taxBeforeRebate = candidate1;
    } else {
      taxBeforeRebate = candidate2;
    }
  }

  // Walk brackets to find chargeable income from taxBeforeRebate
  let remainingTax = taxBeforeRebate;
  let chargeableIncome = 0;
  let prevThreshold = 0;

  for (const { threshold, rate } of BRACKETS) {
    const bandWidth = threshold === Infinity ? Infinity : threshold - prevThreshold;

    if (rate === 0) {
      // 0% band contributes no tax, add full width
      chargeableIncome += bandWidth;
      prevThreshold = threshold;
      continue;
    }

    const maxTaxInBand = bandWidth === Infinity ? Infinity : roundToCent(bandWidth * rate);

    if (remainingTax <= maxTaxInBand + 0.005) {
      // Remaining tax falls within this band
      chargeableIncome += roundToCent(remainingTax / rate);
      remainingTax = 0;
      break;
    }

    // Consume full band
    chargeableIncome += bandWidth;
    remainingTax = roundToCent(remainingTax - maxTaxInBand);
    prevThreshold = threshold;
  }

  return roundToCent(chargeableIncome);
}
