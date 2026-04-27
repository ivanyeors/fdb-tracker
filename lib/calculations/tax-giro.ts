/**
 * IRAS GIRO instalment schedule calculator.
 *
 * Standard IRAS GIRO: 12 monthly payments from April [YA] to March [YA+1].
 * Deducted on the 6th of each month.
 */

export interface GiroInstalment {
  /** ISO month string, e.g. "2026-04" */
  month: string
  amount: number
}

export interface GiroScheduleResult {
  schedule: GiroInstalment[]
  total: number
  monthlyBase: number
}

function roundToCent(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Generate IRAS-standard GIRO schedule from tax payable.
 *
 * - 12 monthly payments: April [year] → March [year+1]
 * - Base monthly = floor(total / 12 * 100) / 100
 * - Outstanding balance added to first payment
 * - Last payment absorbs rounding remainder
 */
export function calculateGiroSchedule(params: {
  taxPayable: number
  year: number
  outstandingBalance?: number
}): GiroScheduleResult {
  const outstanding = Math.max(0, params.outstandingBalance ?? 0)
  const total = roundToCent(params.taxPayable + outstanding)

  if (total <= 0) {
    return { schedule: [], total: 0, monthlyBase: 0 }
  }

  const monthlyBase = Math.floor((total / 12) * 100) / 100
  const schedule: GiroInstalment[] = []

  // 12 months: April [year] through March [year+1]
  for (let i = 0; i < 12; i++) {
    const monthNum = ((3 + i) % 12) + 1 // Apr=4, May=5, ..., Mar=3
    const calendarYear = monthNum >= 4 ? params.year : params.year + 1
    const month = `${calendarYear}-${String(monthNum).padStart(2, "0")}`
    schedule.push({ month, amount: monthlyBase })
  }

  // Remainder goes to last payment
  const sumOfEleven = roundToCent(monthlyBase * 11)
  const lastAmount = roundToCent(total - sumOfEleven)
  schedule.at(-1)!.amount = lastAmount

  // If there's outstanding balance, add it to first payment
  if (outstanding > 0) {
    // Recalculate: tax portion split evenly, outstanding on top of first
    const taxBase = Math.floor((params.taxPayable / 12) * 100) / 100
    for (let i = 0; i < 12; i++) {
      schedule[i].amount = taxBase
    }
    // First payment includes outstanding
    schedule[0].amount = roundToCent(taxBase + outstanding)
    // Last absorbs rounding
    const sumFirst11 = schedule
      .slice(0, 11)
      .reduce((s, g) => s + g.amount, 0)
    schedule[11].amount = roundToCent(total - sumFirst11)
  }

  return { schedule, total, monthlyBase }
}

/**
 * Determine which GIRO payment is "next" based on current date.
 * Returns the index into the schedule array, or -1 if all are in the past.
 */
export function getNextGiroPaymentIndex(
  schedule: GiroInstalment[],
  today?: Date
): number {
  const now = today ?? new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  for (let i = 0; i < schedule.length; i++) {
    if (schedule[i].month >= currentMonth) return i
  }
  return -1
}
