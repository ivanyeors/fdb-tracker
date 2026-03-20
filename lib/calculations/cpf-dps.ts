/**
 * Dependants' Protection Scheme (DPS) — estimated annual premiums.
 * Premiums are deducted from CPF (usually OA), not bank accounts.
 * Source: published Great Eastern / CPF schedules (approximate; verify on CPF statement).
 * Update this table when the board or insurer revises rates.
 */

import { getAge } from "./cpf"

/** Age at last birthday Bracket max age (inclusive upper bound of band). */
type DpsBand = { maxAge: number; annualPremium: number }

/** Rates effective from 2025 (SGD/year). Ages 21–65 eligible; outside returns null. */
const DPS_BANDS_2025: DpsBand[] = [
  { maxAge: 34, annualPremium: 18 },
  { maxAge: 39, annualPremium: 30 },
  { maxAge: 44, annualPremium: 50 },
  { maxAge: 49, annualPremium: 93 },
  { maxAge: 54, annualPremium: 188 },
  { maxAge: 59, annualPremium: 298 },
  { maxAge: 64, annualPremium: 298 },
]

const DPS_MIN_AGE = 21
const DPS_MAX_AGE = 65

function premiumForAge(age: number): number | null {
  if (age < DPS_MIN_AGE || age > DPS_MAX_AGE) return null
  for (const band of DPS_BANDS_2025) {
    if (age <= band.maxAge) return band.annualPremium
  }
  return null
}

/**
 * Annual DPS premium for a given age and calendar year (table selection by year — extend when rates change).
 */
export function getDpsAnnualPremium(age: number, _calendarYear: number = new Date().getFullYear()): number | null {
  void _calendarYear
  return premiumForAge(age)
}

/** Monthly equivalent (spread) for OA projection. */
export function getDpsMonthlyOaDeduction(
  birthYear: number,
  calendarYear: number,
  includeDps: boolean,
): number {
  if (!includeDps) return 0
  const age = getAge(birthYear, calendarYear)
  const annual = getDpsAnnualPremium(age, calendarYear)
  if (annual == null) return 0
  return Math.round((annual / 12) * 100) / 100
}
