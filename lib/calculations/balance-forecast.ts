/**
 * Bank balance forward projection.
 * Projects monthly balances for N months based on known inflows, outflows, and interest.
 */

export type ForecastMonth = {
  /** YYYY-MM-01 */
  month: string
  /** Balance at start of month */
  balance: number
  /** Inflow for the month */
  inflow: number
  /** Outflow for the month */
  outflow: number
  /** Interest earned during the month */
  interest: number
  /** Net change (inflow - outflow + interest) */
  netChange: number
}

export type ForecastInput = {
  startBalance: number
  monthlyInflow: number
  monthlyOutflow: number
  /** Annual interest rate in percent */
  annualRatePct: number
  /** Number of months to forecast */
  months: number
  /** Start month as YYYY-MM-01 */
  startMonth: string
}

function addMonths(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}

export function forecastBalance(input: ForecastInput): ForecastMonth[] {
  const result: ForecastMonth[] = []
  let balance = input.startBalance
  const monthlyRate = input.annualRatePct / 100 / 12

  for (let i = 0; i < input.months; i++) {
    const month = addMonths(input.startMonth, i)
    const interest = Math.round(balance * monthlyRate * 100) / 100
    const netChange =
      Math.round((input.monthlyInflow - input.monthlyOutflow + interest) * 100) / 100

    result.push({
      month,
      balance: Math.round(balance * 100) / 100,
      inflow: input.monthlyInflow,
      outflow: input.monthlyOutflow,
      interest,
      netChange,
    })

    balance += netChange
  }

  return result
}

/**
 * Aggregate forecast across multiple bank accounts.
 * Each account has its own balance and interest rate but shares the same inflow/outflow.
 */
export type AggregateForecastInput = {
  accounts: Array<{
    balance: number
    annualRatePct: number
  }>
  monthlyInflow: number
  monthlyOutflow: number
  months: number
  startMonth: string
}

export function aggregateForecast(input: AggregateForecastInput): ForecastMonth[] {
  const totalBalance = input.accounts.reduce((s, a) => s + a.balance, 0)

  // Weight-average the interest rate
  const weightedRate =
    totalBalance > 0
      ? input.accounts.reduce((s, a) => s + a.balance * a.annualRatePct, 0) / totalBalance
      : 0

  return forecastBalance({
    startBalance: totalBalance,
    monthlyInflow: input.monthlyInflow,
    monthlyOutflow: input.monthlyOutflow,
    annualRatePct: weightedRate,
    months: input.months,
    startMonth: input.startMonth,
  })
}
