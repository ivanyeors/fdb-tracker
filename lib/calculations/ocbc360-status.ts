import type { Ocbc360Config } from "./bank-interest"
import {
  getOcbc360EffectiveRate,
  OCBC_BONUS_FIRST_TIER_CAP,
  OCBC_BONUS_INTEREST_BALANCE_CAP,
  OCBC_BONUS_SECOND_TIER_CAP,
  OCBC_GROW_BALANCE_THRESHOLD,
} from "./bank-interest"

/** Minimum monthly salary credit (proxy: logged inflow or gross monthly from income settings). */
export const OCBC_SALARY_CREDIT_MIN = 1_800

/** Minimum month-on-month balance increase (approximation of OCBC avg daily balance rule). */
export const OCBC_SAVE_INCREASE_MIN = 500

/** Minimum eligible card spend per month (proxy: logged monthly outflow). */
export const OCBC_CARD_SPEND_MIN = 500

export type Ocbc360CategorySource = "auto" | "manual"

export type Ocbc360Progress = {
  current: number
  target: number
}

export type Ocbc360ProgressZone = "safe" | "cautious" | "danger"

export type Ocbc360CategoryRow = {
  id: string
  category: string
  requirement: string
  rateLabel: string
  source: Ocbc360CategorySource
  met: boolean
  progress: Ocbc360Progress | null
  progressLabel: string | null
  zone: Ocbc360ProgressZone | null
  /** Extra context for the condition (e.g. balance delta detail for Save). */
  detail: string | null
}

/** safe >= 100%, cautious >= 70%, danger < 70% */
export function getProgressZone(current: number, target: number): Ocbc360ProgressZone {
  if (target <= 0) return "safe"
  const ratio = current / target
  if (ratio >= 1) return "safe"
  if (ratio >= 0.7) return "cautious"
  return "danger"
}

export type Ocbc360StatusInputs = {
  balance: number
  /** False when no profile can be resolved for cashflow (no account profile and no dashboard context). */
  profileLinked: boolean
  /**
   * Logged monthly inflow for the eval month (`monthly_cashflow` row exists).
   * `null` = no row for that month (not the same as 0 inflow).
   */
  monthlyCashflowInflow: number | null
  /**
   * Logged discretionary outflow for the eval month (`/out`, Settings monthly log).
   * `null` = no row for that month.
   */
  monthlyDiscretionaryOutflow: number | null
  /** `annual_salary / 12` when set; used for Salary only when there is no cashflow row. */
  monthlyGrossSalaryFromIncome: number | null
  /** Latest two snapshots, newest first: [month N, month N-1]. */
  snapshotsClosing: [number, number] | null
  insureMet: boolean
  investMet: boolean
}

const RATE_LABELS: Record<string, string> = {
  Base: "0.05%",
  Salary: "2.00%",
  Save: "1.20%",
  Spend: "0.60%",
  Insure: "1.20%",
  Invest: "1.20%",
  Grow: "2.40%",
}

const REQUIREMENTS: Record<string, string> = {
  Base: "No requirement",
  Salary: `Salary proxy ≥ $${OCBC_SALARY_CREDIT_MIN.toLocaleString("en-SG")}/mth (monthly inflow or income settings)`,
  Save: `Increase balance ≥ $${OCBC_SAVE_INCREASE_MIN}/mth (avg daily balance approx.)`,
  Spend: `Spend proxy ≥ $${OCBC_CARD_SPEND_MIN}/mth (logged monthly outflow)`,
  Insure: "Qualifying OCBC insurance policy",
  Invest: "Unit trusts / structured deposits ≥ $20k (OCBC)",
  Grow: `Balance ≥ $${OCBC_GROW_BALANCE_THRESHOLD.toLocaleString("en-SG")}`,
  BonusTranches: `First S$${OCBC_BONUS_FIRST_TIER_CAP.toLocaleString("en-SG")} + next S$${OCBC_BONUS_SECOND_TIER_CAP.toLocaleString("en-SG")} (max S$${OCBC_BONUS_INTEREST_BALANCE_CAP.toLocaleString("en-SG")})`,
}

/**
 * Derives OCBC 360 category rows with progress for dashboard display.
 */
export function computeOcbc360CategoryRows(
  inputs: Ocbc360StatusInputs,
): Ocbc360CategoryRow[] {
  const {
    balance,
    profileLinked,
    monthlyCashflowInflow,
    monthlyDiscretionaryOutflow,
    monthlyGrossSalaryFromIncome,
    snapshotsClosing,
    insureMet,
    investMet,
  } = inputs

  // Salary — cashflow inflow wins over income settings when a row exists
  let salaryMet = false
  let salaryProgress: Ocbc360Progress | null = null
  let salaryLabel: string | null = null

  if (profileLinked) {
    let salaryProxy: number | null = null
    let salaryFrom: "cashflow" | "income" | null = null
    if (monthlyCashflowInflow !== null) {
      salaryProxy = monthlyCashflowInflow
      salaryFrom = "cashflow"
    } else if (monthlyGrossSalaryFromIncome !== null) {
      salaryProxy = monthlyGrossSalaryFromIncome
      salaryFrom = "income"
    }

    if (salaryProxy === null) {
      salaryLabel = "No monthly inflow logged and no income settings"
    } else {
      salaryMet = salaryProxy >= OCBC_SALARY_CREDIT_MIN
      salaryProgress = {
        current: Math.min(salaryProxy, OCBC_SALARY_CREDIT_MIN),
        target: OCBC_SALARY_CREDIT_MIN,
      }
      const src =
        salaryFrom === "cashflow"
          ? "monthly inflow"
          : "income settings (annual ÷ 12)"
      salaryLabel = `$${salaryProxy.toFixed(0)} / $${OCBC_SALARY_CREDIT_MIN} (${src})`
    }
  } else {
    salaryLabel = "No profile linked to this account"
  }

  // Save (month-on-month closing balance delta)
  let saveMet = false
  let saveProgress: Ocbc360Progress | null = null
  let saveLabel: string | null = null
  let saveDetail: string | null = null
  if (snapshotsClosing === null) {
    saveLabel = "Need at least 2 monthly balance snapshots"
  } else {
    const [latest, prev] = snapshotsClosing
    const delta = latest - prev
    saveMet = delta >= OCBC_SAVE_INCREASE_MIN
    saveProgress = {
      current: Math.max(0, Math.min(delta, OCBC_SAVE_INCREASE_MIN)),
      target: OCBC_SAVE_INCREASE_MIN,
    }
    saveLabel = `$${delta.toFixed(0)} / $${OCBC_SAVE_INCREASE_MIN} (vs prior month)`
    saveDetail = `Previous: $${prev.toLocaleString("en-SG", { maximumFractionDigits: 0 })} → Current: $${latest.toLocaleString("en-SG", { maximumFractionDigits: 0 })}`
  }

  // Spend — logged monthly outflow (`/out`)
  let spendMet = false
  let spendProgress: Ocbc360Progress | null = null
  let spendLabel: string | null = null
  if (!profileLinked) {
    spendLabel = "No profile linked to this account"
  } else if (monthlyDiscretionaryOutflow === null) {
    spendLabel = "No monthly outflow logged for this month (Cashflow / Settings)"
  } else {
    spendMet = monthlyDiscretionaryOutflow >= OCBC_CARD_SPEND_MIN
    spendProgress = {
      current: Math.min(monthlyDiscretionaryOutflow, OCBC_CARD_SPEND_MIN),
      target: OCBC_CARD_SPEND_MIN,
    }
    spendLabel = `$${monthlyDiscretionaryOutflow.toFixed(0)} / $${OCBC_CARD_SPEND_MIN} (monthly outflow)`
  }

  const growMet = balance >= OCBC_GROW_BALANCE_THRESHOLD
  const growProgress: Ocbc360Progress = {
    current: Math.min(balance, OCBC_GROW_BALANCE_THRESHOLD),
    target: OCBC_GROW_BALANCE_THRESHOLD,
  }
  const growLabel = `$${balance.toLocaleString("en-SG", { maximumFractionDigits: 0 })} / $${OCBC_GROW_BALANCE_THRESHOLD.toLocaleString("en-SG")}`

  const bonusTrancheMet = balance >= OCBC_BONUS_INTEREST_BALANCE_CAP
  const bonusTrancheProgress: Ocbc360Progress = {
    current: Math.min(balance, OCBC_BONUS_INTEREST_BALANCE_CAP),
    target: OCBC_BONUS_INTEREST_BALANCE_CAP,
  }
  const bonusTrancheLabel = `$${Math.min(balance, OCBC_BONUS_INTEREST_BALANCE_CAP).toLocaleString("en-SG", { maximumFractionDigits: 0 })} / $${OCBC_BONUS_INTEREST_BALANCE_CAP.toLocaleString("en-SG")}`

  const cfgForStackedRates: Ocbc360Config = {
    salaryMet,
    saveMet,
    spendMet,
    insureMet,
    investMet,
    growMet: balance >= OCBC_GROW_BALANCE_THRESHOLD,
  }
  const { first75kRate, next25kRate } = getOcbc360EffectiveRate(cfgForStackedRates)
  const bonusTrancheRateLabel = `${(first75kRate * 100).toFixed(2)}% / ${(next25kRate * 100).toFixed(2)}%`

  return [
    {
      id: "base",
      category: "Base",
      requirement: REQUIREMENTS.Base,
      rateLabel: RATE_LABELS.Base,
      source: "auto",
      met: true,
      progress: null,
      progressLabel: "—",
      zone: null,
      detail: null,
    },
    {
      id: "salary",
      category: "Salary",
      requirement: REQUIREMENTS.Salary,
      rateLabel: RATE_LABELS.Salary,
      source: "auto",
      met: salaryMet,
      progress: salaryProgress,
      progressLabel: salaryLabel,
      zone: salaryProgress ? getProgressZone(salaryProgress.current, salaryProgress.target) : null,
      detail: null,
    },
    {
      id: "save",
      category: "Save",
      requirement: REQUIREMENTS.Save,
      rateLabel: RATE_LABELS.Save,
      source: "auto",
      met: saveMet,
      progress: saveProgress,
      progressLabel: saveLabel,
      zone: saveProgress ? getProgressZone(saveProgress.current, saveProgress.target) : null,
      detail: saveDetail,
    },
    {
      id: "spend",
      category: "Spend",
      requirement: REQUIREMENTS.Spend,
      rateLabel: RATE_LABELS.Spend,
      source: "auto",
      met: spendMet,
      progress: spendProgress,
      progressLabel: spendLabel,
      zone: spendProgress ? getProgressZone(spendProgress.current, spendProgress.target) : null,
      detail: null,
    },
    {
      id: "insure",
      category: "Insure",
      requirement: REQUIREMENTS.Insure,
      rateLabel: RATE_LABELS.Insure,
      source: "manual",
      met: insureMet,
      progress: null,
      progressLabel: insureMet ? "Confirmed" : "Not confirmed",
      zone: insureMet ? "safe" : "danger",
      detail: null,
    },
    {
      id: "invest",
      category: "Invest",
      requirement: REQUIREMENTS.Invest,
      rateLabel: RATE_LABELS.Invest,
      source: "manual",
      met: investMet,
      progress: null,
      progressLabel: investMet ? "Confirmed" : "Not confirmed",
      zone: investMet ? "safe" : "danger",
      detail: null,
    },
    {
      id: "bonus_tranches",
      category: "Bonus tranches",
      requirement: REQUIREMENTS.BonusTranches,
      rateLabel: bonusTrancheRateLabel,
      source: "auto",
      met: bonusTrancheMet,
      progress: bonusTrancheProgress,
      progressLabel: bonusTrancheLabel,
      zone: getProgressZone(bonusTrancheProgress.current, bonusTrancheProgress.target),
      detail: null,
    },
    {
      id: "grow",
      category: "Grow",
      requirement: REQUIREMENTS.Grow,
      rateLabel: RATE_LABELS.Grow,
      source: "auto",
      met: growMet,
      progress: growProgress,
      progressLabel: growLabel,
      zone: getProgressZone(growProgress.current, growProgress.target),
      detail: null,
    },
  ]
}

/** Builds config for `calculateOcbc360Interest` from derived category rows. */
export function ocbc360RowsToConfig(rows: Ocbc360CategoryRow[]): Ocbc360Config {
  const r = (id: string) => rows.find((x) => x.id === id)?.met ?? false
  return {
    salaryMet: r("salary"),
    saveMet: r("save"),
    spendMet: r("spend"),
    insureMet: r("insure"),
    investMet: r("invest"),
    growMet: r("grow"),
  }
}
