/**
 * Batched cashflow series for a month range: fixed small number of Supabase round-trips,
 * then synchronous per-(profile, month) aggregation. Mirrors getEffectiveInflowForProfile /
 * getEffectiveOutflowForProfile without N×M query waterfalls.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  buildGiroOutflowByProfile,
  discretionaryForProfileMonth,
  effectiveInflowFromContext,
  monthlyTaxForProfile,
  normalizeMonthKey,
  sumIlpPremiums,
  sumInsuranceOutflowPremiumsSplit,
  sumLoanMonthlyPayments,
  yearsInMonths,
  GIRO_OUTFLOW_DESTINATIONS,
} from "@/lib/api/cashflow-aggregation"

export type CashflowRangeRow = {
  month: string
  inflow: number
  discretionary: number
  insurance: number
  ilp: number
  loans: number
  tax: number
  savingsGoals: number
  totalOutflow: number
  /** Aggregated Telegram/dashboard notes for the month (per profile). */
  inflowMemo?: string
  outflowMemo?: string
}

export function getMonthsInRange(
  startMonth: string,
  endMonth: string
): string[] {
  const months: string[] = []
  const [startY, startM] = startMonth.split("-").map(Number)
  const [endY, endM] = endMonth.split("-").map(Number)
  let y = startY
  let m = startM
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, "0")}-01`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return months
}

/**
 * Loads all data for the range in parallel, then aggregates months synchronously.
 */
export async function fetchCashflowRangeSeries(
  supabase: SupabaseClient,
  params: {
    profileIds: string[]
    familyId: string
    startMonth: string
    endMonth: string
  }
): Promise<CashflowRangeRow[]> {
  const { profileIds, familyId, startMonth, endMonth } = params
  const months = getMonthsInRange(startMonth, endMonth)
  if (months.length === 0) return []

  if (profileIds.length === 0) {
    const { data: sharedRows } = await supabase
      .from("ilp_products")
      .select("monthly_premium, premium_payment_mode")
      .eq("family_id", familyId)
      .is("profile_id", null)
    const sharedIlp = sumIlpPremiums(sharedRows)
    return months.map((month) => ({
      month,
      inflow: 0,
      discretionary: 0,
      insurance: 0,
      ilp: sharedIlp,
      loans: 0,
      tax: 0,
      savingsGoals: 0,
      totalOutflow: sharedIlp,
      inflowMemo: undefined,
      outflowMemo: undefined,
    }))
  }

  const years = yearsInMonths(months)

  const [
    cashflowRes,
    profilesRes,
    incomeRes,
    giroRulesRes,
    insuranceRes,
    ilpRes,
    loansRes,
    taxReliefRes,
    sharedIlpRes,
    savingsGoalsRes,
  ] = await Promise.all([
    supabase
      .from("monthly_cashflow")
      .select("profile_id, month, inflow, outflow, inflow_memo, outflow_memo")
      .in("profile_id", profileIds)
      .gte("month", startMonth)
      .lte("month", endMonth),
    supabase
      .from("profiles")
      .select("id, birth_year, name")
      .in("id", profileIds),
    supabase
      .from("income_config")
      .select("profile_id, annual_salary, bonus_estimate")
      .in("profile_id", profileIds),
    supabase
      .from("giro_rules")
      .select("id, amount, source_bank_account_id, linked_entity_type")
      .eq("is_active", true)
      .in("destination_type", [...GIRO_OUTFLOW_DESTINATIONS]),
    supabase
      .from("insurance_policies")
      .select(
        "profile_id, premium_amount, frequency, is_active, deduct_from_outflow, type, coverage_amount"
      )
      .in("profile_id", profileIds),
    supabase
      .from("ilp_products")
      .select("profile_id, monthly_premium, premium_payment_mode")
      .in("profile_id", profileIds),
    supabase
      .from("loans")
      .select("profile_id, principal, rate_pct, tenure_months, use_cpf_oa")
      .in("profile_id", profileIds),
    supabase
      .from("tax_relief_inputs")
      .select("profile_id, year, relief_type, amount")
      .in("profile_id", profileIds)
      .in("year", years.length ? years : [new Date().getFullYear()]),
    supabase
      .from("ilp_products")
      .select("monthly_premium, premium_payment_mode")
      .eq("family_id", familyId)
      .is("profile_id", null),
    supabase
      .from("savings_goals")
      .select("profile_id, monthly_auto_amount")
      .in("profile_id", profileIds),
  ])

  if (cashflowRes.error) throw new Error(cashflowRes.error.message)
  if (profilesRes.error) throw new Error(profilesRes.error.message)
  if (incomeRes.error) throw new Error(incomeRes.error.message)
  if (giroRulesRes.error) throw new Error(giroRulesRes.error.message)
  if (insuranceRes.error) throw new Error(insuranceRes.error.message)
  if (ilpRes.error) throw new Error(ilpRes.error.message)
  if (loansRes.error) throw new Error(loansRes.error.message)
  if (taxReliefRes.error) throw new Error(taxReliefRes.error.message)
  if (sharedIlpRes.error) throw new Error(sharedIlpRes.error.message)
  if (savingsGoalsRes.error) throw new Error(savingsGoalsRes.error.message)

  const accountIds = [
    ...new Set((giroRulesRes.data ?? []).map((r) => r.source_bank_account_id)),
  ]
  const { data: bankAccounts, error: bankErr } =
    accountIds.length > 0
      ? await supabase
          .from("bank_accounts")
          .select("id, profile_id")
          .in("id", accountIds)
      : {
          data: [] as Array<{ id: string; profile_id: string | null }>,
          error: null,
        }
  if (bankErr) throw new Error(bankErr.message)

  const cashflowByKey = new Map<
    string,
    { inflow: number | null; outflow: number | null }
  >()
  const inflowMemoByKey = new Map<string, string>()
  const outflowMemoByKey = new Map<string, string>()
  for (const row of cashflowRes.data ?? []) {
    const m = normalizeMonthKey(row.month as string)
    const key = `${row.profile_id}:${m}`
    cashflowByKey.set(key, {
      inflow: row.inflow,
      outflow: row.outflow,
    })
    const r = row as {
      profile_id: string
      month: string
      inflow_memo?: string | null
      outflow_memo?: string | null
    }
    if (r.inflow_memo?.trim()) {
      inflowMemoByKey.set(key, r.inflow_memo.trim())
    }
    if (r.outflow_memo?.trim()) {
      outflowMemoByKey.set(key, r.outflow_memo.trim())
    }
  }

  const profileById = new Map<string, { birth_year: number; name: string }>()
  for (const p of profilesRes.data ?? []) {
    profileById.set(p.id, { birth_year: p.birth_year, name: p.name })
  }

  const incomeByProfileId = new Map<
    string,
    { annual_salary: number; bonus_estimate: number | null }
  >()
  for (const ic of incomeRes.data ?? []) {
    incomeByProfileId.set(ic.profile_id, {
      annual_salary: ic.annual_salary,
      bonus_estimate: ic.bonus_estimate,
    })
  }

  const giroByProfile = buildGiroOutflowByProfile(
    giroRulesRes.data ?? [],
    bankAccounts ?? [],
    profileIds
  )

  const insuranceByProfile = new Map<
    string,
    Array<{
      premium_amount: number
      frequency: string
      is_active: boolean | null
      deduct_from_outflow: boolean | null
      type: string
      coverage_amount: number | null
    }>
  >()
  for (const pol of insuranceRes.data ?? []) {
    const pid = pol.profile_id as string
    const list = insuranceByProfile.get(pid) ?? []
    list.push({
      premium_amount: pol.premium_amount,
      frequency: pol.frequency,
      is_active: pol.is_active,
      deduct_from_outflow: pol.deduct_from_outflow,
      type: pol.type,
      coverage_amount: pol.coverage_amount,
    })
    insuranceByProfile.set(pid, list)
  }

  const ilpByProfile = new Map<
    string,
    Array<{ monthly_premium: number; premium_payment_mode?: string | null }>
  >()
  for (const row of ilpRes.data ?? []) {
    const pid = row.profile_id as string
    const list = ilpByProfile.get(pid) ?? []
    list.push({
      monthly_premium: row.monthly_premium,
      premium_payment_mode: row.premium_payment_mode,
    })
    ilpByProfile.set(pid, list)
  }

  const loansByProfile = new Map<
    string,
    Array<{ principal: number; rate_pct: number; tenure_months: number; use_cpf_oa?: boolean }>
  >()
  for (const row of loansRes.data ?? []) {
    const pid = row.profile_id as string
    const list = loansByProfile.get(pid) ?? []
    list.push({
      principal: row.principal,
      rate_pct: row.rate_pct,
      tenure_months: row.tenure_months,
      use_cpf_oa: !!row.use_cpf_oa,
    })
    loansByProfile.set(pid, list)
  }

  const taxReliefByProfileYear = new Map<
    string,
    Array<{ relief_type: string; amount: number }>
  >()
  for (const tr of taxReliefRes.data ?? []) {
    const pid = tr.profile_id as string
    const y = tr.year as number
    const key = `${pid}:${y}`
    const list = taxReliefByProfileYear.get(key) ?? []
    list.push({ relief_type: tr.relief_type, amount: tr.amount })
    taxReliefByProfileYear.set(key, list)
  }

  // Savings goals: sum monthly_auto_amount by profile
  const savingsGoalsByProfile = new Map<string, number>()
  for (const g of savingsGoalsRes.data ?? []) {
    const pid = g.profile_id as string
    const amt = (g.monthly_auto_amount as number) ?? 0
    savingsGoalsByProfile.set(pid, (savingsGoalsByProfile.get(pid) ?? 0) + amt)
  }

  const sharedIlp = sumIlpPremiums(sharedIlpRes.data)

  const result: CashflowRangeRow[] = []
  for (const month of months) {
    const monthStr = normalizeMonthKey(month)
    const year = parseInt(monthStr.slice(0, 4), 10) || new Date().getFullYear()

    let inflow = 0
    let discretionary = 0
    let insurance = 0
    let ilp = 0
    let loans = 0
    let tax = 0
    let savingsGoals = 0

    for (const pid of profileIds) {
      inflow += effectiveInflowFromContext(
        pid,
        monthStr,
        year,
        cashflowByKey,
        profileById,
        incomeByProfileId
      )

      discretionary += discretionaryForProfileMonth(
        pid,
        monthStr,
        cashflowByKey,
        giroByProfile
      )

      const pols = insuranceByProfile.get(pid) ?? []
      const insSplit = sumInsuranceOutflowPremiumsSplit(pols)
      insurance += insSplit.insurance
      ilp += insSplit.ilpFromLegacyPolicies

      ilp += sumIlpPremiums(ilpByProfile.get(pid) ?? [])

      loans += sumLoanMonthlyPayments(loansByProfile.get(pid) ?? [])

      savingsGoals += savingsGoalsByProfile.get(pid) ?? 0

      tax += monthlyTaxForProfile(
        pid,
        year,
        profileById,
        incomeByProfileId,
        pols,
        taxReliefByProfileYear.get(`${pid}:${year}`) ?? []
      )
    }

    ilp += sharedIlp
    const totalOutflow =
      discretionary + insurance + ilp + loans + tax + savingsGoals

    const inflowMemoParts: string[] = []
    const outflowMemoParts: string[] = []
    for (const pid of profileIds) {
      const memoKey = `${pid}:${monthStr}`
      const pname = profileById.get(pid)?.name ?? "Member"
      const im = inflowMemoByKey.get(memoKey)
      if (im) inflowMemoParts.push(`${pname}: ${im}`)
      const om = outflowMemoByKey.get(memoKey)
      if (om) outflowMemoParts.push(`${pname}: ${om}`)
    }

    result.push({
      month,
      inflow,
      discretionary,
      insurance,
      ilp,
      loans,
      tax,
      savingsGoals,
      totalOutflow,
      ...(inflowMemoParts.length > 0
        ? { inflowMemo: inflowMemoParts.join(" · ") }
        : {}),
      ...(outflowMemoParts.length > 0
        ? { outflowMemo: outflowMemoParts.join(" · ") }
        : {}),
    })
  }

  return result
}
