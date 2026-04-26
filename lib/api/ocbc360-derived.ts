import { decodeIncomeConfigPii } from "@/lib/repos/income-config"
import { decodeMonthlyCashflowPii } from "@/lib/repos/monthly-cashflow"
import type { createSupabaseAdmin } from "@/lib/supabase/server"
import {
  computeOcbc360CategoryRows,
  type Ocbc360CategoryRow,
} from "@/lib/calculations/ocbc360-status"
import { ocbcEvalMonthFirstDayIso } from "@/lib/calculations/ocbc-eval-month"

export type Ocbc360DerivedPayload = {
  categories: Ocbc360CategoryRow[]
  /** First day of eval month (Asia/Singapore), `YYYY-MM-01`. */
  evalMonth: string
}

type AdminClient = ReturnType<typeof createSupabaseAdmin>

/**
 * Loads income, cashflow, snapshots and builds OCBC 360 category rows for the Banks dashboard.
 *
 * @param contextProfileId - Active profile from `GET /api/bank-accounts?profileId=`. When set
 *   (named profile in header), salary/spend use that profile's income + monthly_cashflow. When
 *   null (Combined), uses `account.profile_id` for owner-linked accounts.
 */
export async function fetchOcbc360DerivedForAccount(
  supabase: AdminClient,
  account: {
    id: string
    profile_id: string | null
    opening_balance: number
  },
  configRow: Record<string, unknown> | null | undefined,
  balance: number,
  contextProfileId: string | null,
): Promise<Ocbc360DerivedPayload> {
  const evalMonth = ocbcEvalMonthFirstDayIso()
  const cashflowProfileId = contextProfileId ?? account.profile_id
  const profileLinked = Boolean(cashflowProfileId)

  let monthlyGrossSalaryFromIncome: number | null = null
  let monthlyCashflowInflow: number | null = null
  let monthlyDiscretionaryOutflow: number | null = null

  // Run all independent queries in parallel
  const [icResult, cfResult, snapsResult] = await Promise.all([
    cashflowProfileId
      ? supabase
          .from("income_config")
          .select("annual_salary, annual_salary_enc")
          .eq("profile_id", cashflowProfileId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    cashflowProfileId
      ? supabase
          .from("monthly_cashflow")
          .select("inflow, inflow_enc, outflow, outflow_enc")
          .eq("profile_id", cashflowProfileId)
          .eq("month", evalMonth)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("bank_balance_snapshots")
      .select("closing_balance")
      .eq("account_id", account.id)
      .order("month", { ascending: false })
      .limit(2),
  ])

  const ic = icResult.data
  if (ic) {
    const annualSalary = decodeIncomeConfigPii(ic).annual_salary ?? 0
    if (annualSalary > 0) {
      monthlyGrossSalaryFromIncome = annualSalary / 12
    }
  }

  const cf = cfResult.data
  if (cf) {
    const decoded = decodeMonthlyCashflowPii(cf)
    monthlyCashflowInflow = decoded.inflow ?? 0
    monthlyDiscretionaryOutflow = decoded.outflow ?? 0
  }

  const twoSnaps = snapsResult.data

  let snapshotsClosing: [number, number] | null = null
  if (twoSnaps && twoSnaps.length >= 2) {
    snapshotsClosing = [Number(twoSnaps[0].closing_balance), Number(twoSnaps[1].closing_balance)]
  }

  const categories = computeOcbc360CategoryRows({
    balance,
    profileLinked,
    monthlyCashflowInflow,
    monthlyDiscretionaryOutflow,
    monthlyGrossSalaryFromIncome,
    snapshotsClosing,
    insureMet: Boolean(configRow?.insure_met),
    investMet: Boolean(configRow?.invest_met),
  })

  return { categories, evalMonth }
}
