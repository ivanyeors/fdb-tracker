/**
 * Singapore self-help group fund contribution calculator.
 * CDAC, SINDA, MBMF, ECF — payroll deductions alongside CPF.
 */

export type SelfHelpGroup = "cdac" | "sinda" | "mbmf" | "ecf" | "none"

export type SelfHelpContribution = {
  group: SelfHelpGroup
  monthlyAmount: number
  annualAmount: number
}

/** CDAC rates effective 1 Jan 2015 */
function cdacMonthly(grossMonthly: number): number {
  if (grossMonthly <= 2000) return 0.5
  if (grossMonthly <= 3500) return 1.0
  if (grossMonthly <= 5000) return 1.5
  if (grossMonthly <= 7500) return 2.0
  return 3.0
}

/** SINDA rates effective 1 Jan 2015 */
function sindaMonthly(grossMonthly: number): number {
  if (grossMonthly <= 2000) return 1.0
  if (grossMonthly <= 3000) return 3.0
  if (grossMonthly <= 5000) return 5.0
  if (grossMonthly <= 7500) return 7.0
  return 9.0
}

/** MBMF rates effective 1 Jan 2016 */
function mbmfMonthly(grossMonthly: number): number {
  if (grossMonthly <= 2000) return 1.5
  if (grossMonthly <= 3000) return 2.5
  if (grossMonthly <= 4000) return 3.5
  if (grossMonthly <= 6000) return 5.0
  return 6.5
}

/** ECF rates effective 1 Feb 2016 */
function ecfMonthly(grossMonthly: number): number {
  if (grossMonthly <= 2000) return 0.5
  if (grossMonthly <= 4000) return 1.0
  return 2.0
}

const LOOKUP: Record<
  Exclude<SelfHelpGroup, "none">,
  (grossMonthly: number) => number
> = {
  cdac: cdacMonthly,
  sinda: sindaMonthly,
  mbmf: mbmfMonthly,
  ecf: ecfMonthly,
}

export function calculateSelfHelpContribution(
  grossMonthly: number,
  group: SelfHelpGroup,
): SelfHelpContribution {
  if (group === "none" || grossMonthly <= 0) {
    return { group, monthlyAmount: 0, annualAmount: 0 }
  }

  const monthlyAmount = LOOKUP[group](grossMonthly)
  return {
    group,
    monthlyAmount,
    annualAmount: monthlyAmount * 12,
  }
}
