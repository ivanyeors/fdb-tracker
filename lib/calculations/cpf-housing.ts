import { differenceInCalendarMonths, startOfMonth, parseISO } from "date-fns"

export type CpfHousingTrancheInput = {
  id?: string
  principalWithdrawn: number
  withdrawalDate: string | Date
}

const DEFAULT_CPF_OA_ACCRUAL_RATE = 0.025

export function wholeMonthsForAccrual(
  withdrawalDate: string | Date,
  asOfDate: string | Date,
): number {
  const w = typeof withdrawalDate === "string" ? parseISO(withdrawalDate.slice(0, 10)) : withdrawalDate
  const a = typeof asOfDate === "string" ? parseISO(asOfDate.slice(0, 10)) : asOfDate
  const n = differenceInCalendarMonths(startOfMonth(a), startOfMonth(w))
  return Math.max(0, n)
}

/**
 * CPF OA accrued interest on housing withdrawals: 2.5% p.a. compounded monthly (policy rate; verify with CPF).
 * Accrued = P * ((1 + r/12)^n - 1)
 */
export function accruedInterestForTranche(
  principal: number,
  withdrawalDate: string | Date,
  asOfDate: string | Date,
  annualRate: number = DEFAULT_CPF_OA_ACCRUAL_RATE,
): number {
  if (principal <= 0) return 0
  const n = wholeMonthsForAccrual(withdrawalDate, asOfDate)
  if (n === 0) return 0
  const m = annualRate / 12
  const accrued = principal * (Math.pow(1 + m, n) - 1)
  return Math.round(accrued * 100) / 100
}

export type TrancheAccrualDetail = CpfHousingTrancheInput & {
  monthsElapsed: number
  accruedInterest: number
}

export function detailTrancheAccrual(
  tranche: CpfHousingTrancheInput,
  asOfDate: string | Date,
  annualRate?: number,
): TrancheAccrualDetail {
  const monthsElapsed = wholeMonthsForAccrual(tranche.withdrawalDate, asOfDate)
  const accruedInterest = accruedInterestForTranche(
    tranche.principalWithdrawn,
    tranche.withdrawalDate,
    asOfDate,
    annualRate,
  )
  return { ...tranche, monthsElapsed, accruedInterest }
}

export type HousingUsageAggregate = {
  totalPrincipal: number
  totalAccruedInterest: number
  refundDue: number
}

export function aggregateHousingUsage(
  tranches: CpfHousingTrancheInput[],
  asOfDate: string | Date,
  annualRate?: number,
): HousingUsageAggregate {
  let totalPrincipal = 0
  let totalAccruedInterest = 0
  for (const t of tranches) {
    const p = Number(t.principalWithdrawn) || 0
    totalPrincipal += p
    totalAccruedInterest += accruedInterestForTranche(p, t.withdrawalDate, asOfDate, annualRate)
  }
  totalPrincipal = Math.round(totalPrincipal * 100) / 100
  totalAccruedInterest = Math.round(totalAccruedInterest * 100) / 100
  return {
    totalPrincipal,
    totalAccruedInterest,
    refundDue: Math.round((totalPrincipal + totalAccruedInterest) * 100) / 100,
  }
}

/** Remaining headroom before hitting 120% of valuation limit (VL). Returns null if VL not set. */
export function vlHeadroom120(
  valuationLimit: number | null | undefined,
  totalCpfPrincipalUsed: number,
): number | null {
  if (valuationLimit == null || valuationLimit <= 0) return null
  const cap = 1.2 * valuationLimit
  return Math.max(0, Math.round((cap - totalCpfPrincipalUsed) * 100) / 100)
}
