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
