/**
 * Loan amortization helpers for outstanding balance and payment schedule.
 */

export function loanMonthlyPayment(
  principal: number,
  annualRatePct: number,
  tenureMonths: number,
): number {
  if (tenureMonths <= 0) return 0
  if (principal <= 0) return 0
  if (annualRatePct === 0) return principal / tenureMonths
  const r = annualRatePct / 100 / 12
  return (principal * r * Math.pow(1 + r, tenureMonths)) / (Math.pow(1 + r, tenureMonths) - 1)
}

export type RepaymentEvent = { amount: number; date: string }

/**
 * Estimate remaining principal after logged repayments and lump-sum early repayments.
 * Each regular repayment pays interest first (on current balance), then principal.
 * Early repayments reduce principal in full on that date.
 */
export function estimateOutstandingPrincipal(
  principal: number,
  annualRatePct: number,
  repayments: RepaymentEvent[],
  earlyRepayments: RepaymentEvent[],
): number {
  const r = annualRatePct / 100 / 12
  let balance = principal

  const events = [
    ...repayments.map((e) => ({ ...e, kind: "scheduled" as const })),
    ...earlyRepayments.map((e) => ({ ...e, kind: "early" as const })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  for (const e of events) {
    if (e.kind === "early") {
      balance = Math.max(0, round2(balance - e.amount))
      continue
    }
    const interestPortion = round2(balance * r)
    const principalPortion = Math.min(Math.max(0, e.amount - interestPortion), balance)
    balance = Math.max(0, round2(balance - principalPortion))
  }

  return round2(balance)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Interest and principal split for a single payment against current balance (before payment).
 */
export function splitPayment(
  balanceBefore: number,
  annualRatePct: number,
  paymentAmount: number,
): { interest: number; principal: number } {
  const r = annualRatePct / 100 / 12
  const interest = round2(balanceBefore * r)
  const principal = round2(Math.min(Math.max(0, paymentAmount - interest), balanceBefore))
  return { interest, principal }
}

// --- Loan Split helpers ---

/** Return a profile's share of a loan amount based on the split percentage. */
export function splitLoanAmount(
  amount: number,
  splitPct: number,
  isPrimary: boolean,
): number {
  const pct = isPrimary ? splitPct : 100 - splitPct
  return round2(amount * (pct / 100))
}

// --- Rate Increase helpers ---

/**
 * Get the effective annual interest rate at a given month offset from loan start,
 * accounting for annual rate increases.
 */
export function effectiveRate(
  initialRatePct: number,
  rateIncreasePct: number | null | undefined,
  monthOffset: number,
): number {
  if (!rateIncreasePct || monthOffset <= 0) return initialRatePct
  const yearsElapsed = Math.floor(monthOffset / 12)
  return initialRatePct + rateIncreasePct * yearsElapsed
}

/**
 * Monthly payment recalculated at a given month offset, assuming HDB-style
 * annual rate review: each year the rate steps up and payment is recalculated
 * on the remaining balance for the remaining tenure.
 */
export function loanMonthlyPaymentAtMonth(
  remainingBalance: number,
  initialRatePct: number,
  rateIncreasePct: number | null | undefined,
  remainingMonths: number,
  monthOffset: number,
): number {
  const rate = effectiveRate(initialRatePct, rateIncreasePct, monthOffset)
  return loanMonthlyPayment(remainingBalance, rate, remainingMonths)
}

// --- Early Repayment helpers ---

/**
 * Calculate early repayment penalty for a housing loan.
 * HDB: always 0. Private: penalty % applied during lock-in period.
 */
export function calculateEarlyRepaymentPenalty(
  amount: number,
  loan: {
    property_type: string | null
    lock_in_end_date: string | null
    early_repayment_penalty_pct: number | null
  },
  repaymentDate: string,
): number {
  if (loan.property_type === "hdb") return 0
  if (!loan.lock_in_end_date || !loan.early_repayment_penalty_pct) return 0
  if (repaymentDate > loan.lock_in_end_date) return 0
  return round2(amount * (loan.early_repayment_penalty_pct / 100))
}

/**
 * Check whether a proposed early repayment stays within the annual prepayment limit.
 */
export function checkAnnualPrepaymentLimit(
  outstandingBalance: number,
  existingPrepaymentsThisYear: number,
  proposedAmount: number,
  maxAnnualPrepaymentPct: number | null,
): { allowed: boolean; maxRemaining: number | null } {
  if (maxAnnualPrepaymentPct == null) return { allowed: true, maxRemaining: null }
  const maxAmount = round2(outstandingBalance * (maxAnnualPrepaymentPct / 100))
  const remaining = Math.max(0, round2(maxAmount - existingPrepaymentsThisYear))
  return {
    allowed: proposedAmount <= remaining + 0.01, // small epsilon for rounding
    maxRemaining: remaining,
  }
}

/**
 * Estimate interest savings and months saved from an early repayment.
 */
export function prepaymentSavingsEstimate(
  outstandingBalance: number,
  annualRatePct: number,
  remainingMonths: number,
  prepaymentAmount: number,
  penaltyAmount: number,
): {
  interestSaved: number
  netSavings: number
  monthsSaved: number
} {
  const totalWithout = totalInterestOverLife(outstandingBalance, annualRatePct, remainingMonths)
  const newBalance = Math.max(0, outstandingBalance - prepaymentAmount)
  const totalWith = totalInterestOverLife(newBalance, annualRatePct, remainingMonths)
  const interestSaved = round2(totalWithout - totalWith)

  // Calculate months saved by comparing original vs reduced monthly payment tenure
  const monthlyPayment = loanMonthlyPayment(outstandingBalance, annualRatePct, remainingMonths)
  let monthsSaved = 0
  if (monthlyPayment > 0 && newBalance > 0) {
    const newMonths = monthsToPayOff(newBalance, annualRatePct, monthlyPayment)
    monthsSaved = Math.max(0, remainingMonths - newMonths)
  } else if (newBalance <= 0) {
    monthsSaved = remainingMonths
  }

  return {
    interestSaved,
    netSavings: round2(interestSaved - penaltyAmount),
    monthsSaved,
  }
}

/** Total interest paid over the life of a loan (simple amortization). */
function totalInterestOverLife(
  principal: number,
  annualRatePct: number,
  months: number,
): number {
  if (principal <= 0 || months <= 0) return 0
  if (annualRatePct === 0) return 0
  const payment = loanMonthlyPayment(principal, annualRatePct, months)
  return round2(payment * months - principal)
}

/** Number of months to pay off a balance at a given monthly payment and rate. */
function monthsToPayOff(
  balance: number,
  annualRatePct: number,
  monthlyPayment: number,
): number {
  if (balance <= 0 || monthlyPayment <= 0) return 0
  if (annualRatePct === 0) return Math.ceil(balance / monthlyPayment)
  const r = annualRatePct / 100 / 12
  if (monthlyPayment <= balance * r) return Infinity // payment doesn't cover interest
  return Math.ceil(Math.log(monthlyPayment / (monthlyPayment - balance * r)) / Math.log(1 + r))
}
