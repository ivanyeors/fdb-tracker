const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

export function getAnnualPremium(
  premium: number,
  frequency: "monthly" | "yearly",
): number {
  return frequency === "monthly" ? premium * 12 : premium
}

export function getMonthlyEquivalent(
  premium: number,
  frequency: "monthly" | "yearly",
): number {
  return frequency === "monthly" ? premium : premium / 12
}

type PolicyForPremium = {
  name: string
  type: string
  premium_amount: number
  frequency: string
  yearly_outflow_date: number | null
  is_active: boolean
  cpf_premium?: number | null
}

export type MonthPremiumEntry = {
  month: number
  monthLabel: string
  premiums: Array<{
    name: string
    amount: number
    type: string
    isRecurring: boolean
    isCpf?: boolean
  }>
  total: number
  cpfTotal: number
}

export function getUpcomingPremiums(
  policies: PolicyForPremium[],
  currentMonth: number,
): MonthPremiumEntry[] {
  const activePolicies = policies.filter((p) => p.is_active)

  const months: MonthPremiumEntry[] = Array.from({ length: 12 }, (_, i) => {
    const month = ((currentMonth - 1 + i) % 12) + 1
    return {
      month,
      monthLabel: MONTH_LABELS[month - 1],
      premiums: [],
      total: 0,
      cpfTotal: 0,
    }
  })

  for (const policy of activePolicies) {
    const cpfAnnual = policy.cpf_premium ?? 0

    if (policy.frequency === "monthly") {
      const cpfMonthly = cpfAnnual / 12
      for (const entry of months) {
        entry.premiums.push({
          name: policy.name,
          amount: policy.premium_amount,
          type: policy.type,
          isRecurring: true,
        })
        entry.total += policy.premium_amount
        if (cpfMonthly > 0) {
          entry.premiums.push({
            name: `${policy.name} (CPF)`,
            amount: cpfMonthly,
            type: policy.type,
            isRecurring: true,
            isCpf: true,
          })
          entry.cpfTotal += cpfMonthly
        }
      }
    } else if (
      policy.frequency === "yearly" &&
      policy.yearly_outflow_date
    ) {
      const target = months.find(
        (m) => m.month === policy.yearly_outflow_date,
      )
      if (target) {
        target.premiums.push({
          name: policy.name,
          amount: policy.premium_amount,
          type: policy.type,
          isRecurring: false,
        })
        target.total += policy.premium_amount
        if (cpfAnnual > 0) {
          target.premiums.push({
            name: `${policy.name} (CPF)`,
            amount: cpfAnnual,
            type: policy.type,
            isRecurring: false,
            isCpf: true,
          })
          target.cpfTotal += cpfAnnual
        }
      }
    }
  }

  return months
}

type PremiumScheduleRow = {
  age_band_min: number
  age_band_max: number
  premium: number
}

export function projectPremiumByAge(
  schedule: PremiumScheduleRow[],
  currentAge: number,
): Array<{ age: number; premium: number }> {
  if (schedule.length === 0) return []

  const sorted = [...schedule].sort(
    (a, b) => a.age_band_min - b.age_band_min,
  )
  const maxAge = Math.max(...sorted.map((s) => s.age_band_max))
  const result: Array<{ age: number; premium: number }> = []

  for (let age = currentAge; age <= maxAge; age++) {
    const band = sorted.find(
      (s) => age >= s.age_band_min && age <= s.age_band_max,
    )
    if (band) {
      result.push({ age, premium: band.premium })
    }
  }

  return result
}
