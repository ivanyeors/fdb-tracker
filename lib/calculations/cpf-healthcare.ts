/**
 * CPF Healthcare deductions from MediSave Account (MA).
 *
 * Covers four schemes that appear on the CPF Yearly Statement:
 *   MSL  – MediShield Life (mandatory, age-based)
 *   CSL  – CareShield Life (mandatory from 1980 cohort onward)
 *   SUP  – CareShield Life Supplement (optional)
 *   PMI  – Integrated Shield Plan additional component (optional)
 *
 * MSL premiums use published CPF Board rates (from 1 Apr 2025, incl. 9% GST).
 * CSL/SUP/PMI vary too much by insurer, cohort, and subsidy tier — stored as
 * user-configurable annual amounts in `cpf_healthcare_config`.
 */

import { getAge } from "./cpf"

// ---------------------------------------------------------------------------
// MediShield Life (MSL) — age-next-birthday bands, annual premium (SGD)
// Source: CPF Board / MOH, effective 1 Apr 2025, inclusive of 9 % GST.
// ---------------------------------------------------------------------------
type MslBand = { maxAgeNextBirthday: number; annualPremium: number }

const MSL_BANDS_2025: MslBand[] = [
  { maxAgeNextBirthday: 20, annualPremium: 200 },
  { maxAgeNextBirthday: 30, annualPremium: 295 },
  { maxAgeNextBirthday: 40, annualPremium: 503 },
  { maxAgeNextBirthday: 50, annualPremium: 637 },
  { maxAgeNextBirthday: 60, annualPremium: 903 },
  { maxAgeNextBirthday: 65, annualPremium: 1131 },
  { maxAgeNextBirthday: 70, annualPremium: 1326 },
  { maxAgeNextBirthday: 73, annualPremium: 1643 },
  { maxAgeNextBirthday: 75, annualPremium: 1816 },
  { maxAgeNextBirthday: 78, annualPremium: 2027 },
  { maxAgeNextBirthday: 80, annualPremium: 2187 },
  { maxAgeNextBirthday: 83, annualPremium: 2303 },
  { maxAgeNextBirthday: 85, annualPremium: 2616 },
  { maxAgeNextBirthday: 90, annualPremium: 2785 },
  { maxAgeNextBirthday: Infinity, annualPremium: 2826 },
]

/**
 * Estimate annual MediShield Life premium given age (current age, not age-next-birthday).
 * Returns the published premium before any citizen subsidies.
 * Pass `null` to disable MSL in projections.
 */
export function getMslAnnualPremium(age: number): number {
  // MSL uses "age next birthday" = current age + 1
  const ageNextBday = age + 1
  for (const band of MSL_BANDS_2025) {
    if (ageNextBday <= band.maxAgeNextBirthday) return band.annualPremium
  }
  return MSL_BANDS_2025.at(-1)!.annualPremium
}

// ---------------------------------------------------------------------------
// Healthcare config type (mirrors DB table)
// ---------------------------------------------------------------------------
export type CpfHealthcareConfig = {
  id?: string
  profileId: string
  /** Override MSL premium; null = use age-based estimate */
  mslAnnualOverride: number | null
  /** Annual CareShield Life premium (user-entered from CPF statement) */
  cslAnnual: number
  /** Annual CareShield Life Supplement premium */
  cslSupplementAnnual: number
  /** Annual Integrated Shield Plan additional component premium */
  ispAnnual: number
}

// ---------------------------------------------------------------------------
// Aggregated annual MA deduction
// ---------------------------------------------------------------------------
export type HealthcareMaBreakdown = {
  msl: number
  csl: number
  sup: number
  pmi: number
  total: number
}

/**
 * Total annual MediSave deductions for healthcare schemes.
 */
export function getAnnualHealthcareMaDeduction(
  age: number,
  config: CpfHealthcareConfig | null,
): HealthcareMaBreakdown {
  if (!config) {
    // No config — estimate MSL only (mandatory for all citizens)
    const msl = getMslAnnualPremium(age)
    return { msl, csl: 0, sup: 0, pmi: 0, total: msl }
  }

  const msl = config.mslAnnualOverride ?? getMslAnnualPremium(age)
  const csl = config.cslAnnual
  const sup = config.cslSupplementAnnual
  const pmi = config.ispAnnual

  return {
    msl,
    csl,
    sup,
    pmi,
    total: Math.round((msl + csl + sup + pmi) * 100) / 100,
  }
}

/**
 * Monthly MA deduction (spread evenly) — suitable as callback for projections.
 */
export function getMonthlyHealthcareMaDeduction(
  birthYear: number,
  calendarYear: number,
  config: CpfHealthcareConfig | null,
): number {
  const age = getAge(birthYear, calendarYear)
  const { total } = getAnnualHealthcareMaDeduction(age, config)
  return Math.round((total / 12) * 100) / 100
}
