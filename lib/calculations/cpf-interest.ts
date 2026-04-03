/**
 * CPF Interest calculations.
 *
 * CPF credits interest once a year on 31 Dec as a lump sum.
 * The formula: interest on each account = sum of monthly closing balances × annual rate / 12
 *
 * Extra interest (1% p.a.) applies on the first $60,000 of combined balances,
 * with the first $20,000 from OA. Members aged ≥55 receive additional bonus interest.
 *
 * This module provides:
 * - Annual interest estimation from current balances (for the "Government inflow" card)
 * - Derivation of interest from balance deltas (for historical data)
 */

const OA_RATE = 0.025
const SA_RATE = 0.04
const MA_RATE = 0.04
const EXTRA_RATE = 0.01

function roundToCent(value: number): number {
  return Math.round(value * 100) / 100
}

export type CpfInterestBreakdown = {
  oaBase: number
  saBase: number
  maBase: number
  extraInterest: number
  total: number
}

/**
 * Estimate annual interest earned on current CPF balances.
 * Uses a simplified model: balance × rate (assumes balance is roughly stable through the year).
 * For a more accurate model, use `calculateAnnualInterest` with monthly closing balances.
 */
export function estimateAnnualInterest(
  oa: number,
  sa: number,
  ma: number,
  age: number,
): CpfInterestBreakdown {
  const oaBase = roundToCent(oa * OA_RATE)
  const saBase = roundToCent(sa * SA_RATE)
  const maBase = roundToCent(ma * MA_RATE)

  // Extra interest on first $60k combined (first $20k from OA)
  const oaForExtra = Math.min(oa, 20000)
  const remainingCap = 60000 - oaForExtra
  const saForExtra = Math.min(sa, remainingCap)
  const maForExtra = Math.min(ma, Math.max(remainingCap - saForExtra, 0))

  let extraInterest = roundToCent(
    (oaForExtra + saForExtra + maForExtra) * EXTRA_RATE,
  )

  // Bonus interest for age ≥ 55
  if (age >= 55) {
    const extraBase = oaForExtra + saForExtra + maForExtra
    const secondTier = Math.min(extraBase, 30000)
    const thirdTier = Math.min(Math.max(extraBase - 30000, 0), 30000)
    extraInterest += roundToCent(secondTier * 0.02 + thirdTier * 0.01)
  }

  return {
    oaBase,
    saBase,
    maBase,
    extraInterest,
    total: roundToCent(oaBase + saBase + maBase + extraInterest),
  }
}

/**
 * Calculate annual interest using the actual CPF method:
 * interest = sum of monthly closing balances × annual rate / 12
 *
 * Each element in `monthlyBalances` is { oa, sa, ma } for months Jan–Dec.
 */
export function calculateAnnualInterest(
  monthlyBalances: Array<{ oa: number; sa: number; ma: number }>,
  age: number,
): CpfInterestBreakdown {
  if (monthlyBalances.length === 0) {
    return { oaBase: 0, saBase: 0, maBase: 0, extraInterest: 0, total: 0 }
  }

  const sumOa = monthlyBalances.reduce((s, b) => s + b.oa, 0)
  const sumSa = monthlyBalances.reduce((s, b) => s + b.sa, 0)
  const sumMa = monthlyBalances.reduce((s, b) => s + b.ma, 0)
  const n = monthlyBalances.length

  const oaBase = roundToCent((sumOa * OA_RATE) / n)
  const saBase = roundToCent((sumSa * SA_RATE) / n)
  const maBase = roundToCent((sumMa * MA_RATE) / n)

  // Extra interest calculated on average monthly balances
  const avgOa = sumOa / n
  const avgSa = sumSa / n
  const avgMa = sumMa / n

  const oaForExtra = Math.min(avgOa, 20000)
  const remainingCap = 60000 - oaForExtra
  const saForExtra = Math.min(avgSa, remainingCap)
  const maForExtra = Math.min(avgMa, Math.max(remainingCap - saForExtra, 0))
  const extraBase = oaForExtra + saForExtra + maForExtra

  let extraInterest = roundToCent(extraBase * EXTRA_RATE)

  if (age >= 55) {
    const secondTier = Math.min(extraBase, 30000)
    const thirdTier = Math.min(Math.max(extraBase - 30000, 0), 30000)
    extraInterest += roundToCent(secondTier * 0.02 + thirdTier * 0.01)
  }

  return {
    oaBase,
    saBase,
    maBase,
    extraInterest,
    total: roundToCent(oaBase + saBase + maBase + extraInterest),
  }
}

/**
 * Derive interest earned from balance deltas (for historical years with manual balance data).
 *
 * interest ≈ (endBalance - startBalance) - totalContributions + totalOutflows
 *
 * This is an approximation since we may not track every outflow type.
 */
export function deriveInterestFromDeltas(
  startBalance: { oa: number; sa: number; ma: number },
  endBalance: { oa: number; sa: number; ma: number },
  totalContributions: number,
  totalOutflows: number,
): number {
  const startTotal = startBalance.oa + startBalance.sa + startBalance.ma
  const endTotal = endBalance.oa + endBalance.sa + endBalance.ma
  const delta = endTotal - startTotal
  return roundToCent(delta - totalContributions + totalOutflows)
}
