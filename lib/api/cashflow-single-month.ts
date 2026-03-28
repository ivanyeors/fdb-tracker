/**
 * Batched single-month cashflow with inflow/outflow breakdown.
 * Replaces the N+1 per-profile loop in the cashflow waterfall mode.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { calculateTakeHome } from "@/lib/calculations/take-home"
import {
  buildGiroOutflowByProfile,
  discretionaryForProfileMonth,
  monthlyTaxForProfile,
  normalizeMonthKey,
  sumIlpPremiums,
  sumInsuranceOutflowPremiumsSplit,
  sumLoanMonthlyPayments,
  GIRO_OUTFLOW_DESTINATIONS,
  type CashflowRow,
  type IncomeData,
  type InsurancePolicy,
  type ProfileData,
} from "@/lib/api/cashflow-aggregation"

type SingleMonthResult = {
  month: string
  inflowTotal: number
  inflowBreakdown?: Record<string, number>
  outflowTotal: number
  outflowBreakdown: {
    discretionary: number
    insurance: number
    ilp: number
    loans: number
    tax: number
    savingsGoals: number
  }
  netSavings: number
}

export async function fetchSingleMonthCashflow(
  supabase: SupabaseClient,
  params: {
    profileIds: string[]
    familyId: string
    month: string
  }
): Promise<SingleMonthResult> {
  const { profileIds, familyId, month } = params
  const monthStr = normalizeMonthKey(month)
  const year = parseInt(monthStr.slice(0, 4), 10) || new Date().getFullYear()

  // Batch load all data in parallel
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
      .select("profile_id, month, inflow, outflow")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"])
      .eq("month", monthStr),
    supabase
      .from("profiles")
      .select("id, birth_year, name")
      .in("id", profileIds.length > 0 ? profileIds : ["__none__"]),
    supabase
      .from("income_config")
      .select("profile_id, annual_salary, bonus_estimate")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
    supabase
      .from("giro_rules")
      .select("id, amount, source_bank_account_id, linked_entity_type")
      .eq("is_active", true)
      .in("destination_type", [...GIRO_OUTFLOW_DESTINATIONS]),
    supabase
      .from("insurance_policies")
      .select(
        "profile_id, premium_amount, frequency, is_active, deduct_from_outflow, type, coverage_amount, end_date"
      )
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
    supabase
      .from("ilp_products")
      .select("profile_id, monthly_premium, premium_payment_mode")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
    supabase
      .from("loans")
      .select("profile_id, principal, rate_pct, tenure_months")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
    supabase
      .from("tax_relief_inputs")
      .select("profile_id, year, relief_type, amount")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"])
      .eq("year", year),
    supabase
      .from("ilp_products")
      .select("monthly_premium, premium_payment_mode")
      .eq("family_id", familyId)
      .is("profile_id", null),
    supabase
      .from("savings_goals")
      .select("profile_id, monthly_auto_amount")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
  ])

  // Build lookup maps
  const cashflowByKey = new Map<string, CashflowRow>()
  for (const row of cashflowRes.data ?? []) {
    const key = `${row.profile_id}:${normalizeMonthKey(row.month as string)}`
    cashflowByKey.set(key, { inflow: row.inflow, outflow: row.outflow })
  }

  const profileById = new Map<string, ProfileData>()
  for (const p of profilesRes.data ?? []) {
    profileById.set(p.id, { birth_year: p.birth_year, name: p.name })
  }

  const incomeByProfileId = new Map<string, IncomeData>()
  for (const ic of incomeRes.data ?? []) {
    incomeByProfileId.set(ic.profile_id, {
      annual_salary: ic.annual_salary,
      bonus_estimate: ic.bonus_estimate,
    })
  }

  // GIRO: need bank accounts for the giro rules
  const giroAccountIds = [
    ...new Set((giroRulesRes.data ?? []).map((r) => r.source_bank_account_id)),
  ]
  let bankAccounts: Array<{ id: string; profile_id: string | null }> = []
  if (giroAccountIds.length > 0) {
    const { data } = await supabase
      .from("bank_accounts")
      .select("id, profile_id")
      .in("id", giroAccountIds)
    bankAccounts = data ?? []
  }
  const giroByProfile = buildGiroOutflowByProfile(
    giroRulesRes.data ?? [],
    bankAccounts,
    profileIds
  )

  const nowDate = new Date().toISOString().slice(0, 10)
  const insuranceByProfile = new Map<string, InsurancePolicy[]>()
  for (const pol of insuranceRes.data ?? []) {
    const pid = pol.profile_id as string
    if (pol.end_date && pol.end_date < nowDate) continue
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
    Array<{ principal: number; rate_pct: number; tenure_months: number }>
  >()
  for (const row of loansRes.data ?? []) {
    const pid = row.profile_id as string
    const list = loansByProfile.get(pid) ?? []
    list.push({
      principal: row.principal,
      rate_pct: row.rate_pct,
      tenure_months: row.tenure_months,
    })
    loansByProfile.set(pid, list)
  }

  const taxReliefByProfileYear = new Map<
    string,
    Array<{ relief_type: string; amount: number }>
  >()
  for (const tr of taxReliefRes.data ?? []) {
    const key = `${tr.profile_id}:${tr.year}`
    const list = taxReliefByProfileYear.get(key) ?? []
    list.push({ relief_type: tr.relief_type, amount: tr.amount })
    taxReliefByProfileYear.set(key, list)
  }

  const savingsGoalsByProfile = new Map<string, number>()
  for (const g of savingsGoalsRes.data ?? []) {
    const pid = g.profile_id as string
    const amt = (g.monthly_auto_amount as number) ?? 0
    savingsGoalsByProfile.set(pid, (savingsGoalsByProfile.get(pid) ?? 0) + amt)
  }

  // Aggregate per profile
  let inflowTotal = 0
  const inflowBreakdown: {
    salary?: number
    bonus?: number
    income?: number
  } = {}
  let discretionary = 0
  let insurance = 0
  let ilp = 0
  let loans = 0
  let tax = 0
  let savingsGoals = 0

  for (const pid of profileIds) {
    // Inflow with breakdown
    const key = `${pid}:${monthStr}`
    const hasCashflow = cashflowByKey.has(key)

    if (hasCashflow) {
      const cfInflow = cashflowByKey.get(key)!.inflow ?? 0
      inflowTotal += cfInflow
      inflowBreakdown.income = (inflowBreakdown.income ?? 0) + cfInflow
    } else {
      const profile = profileById.get(pid)
      const incomeConfig = incomeByProfileId.get(pid)
      if (profile && incomeConfig && incomeConfig.annual_salary > 0) {
        const result = calculateTakeHome(
          incomeConfig.annual_salary,
          incomeConfig.bonus_estimate ?? 0,
          profile.birth_year,
          year
        )
        const monthlyTotal = result.annualTakeHome / 12
        inflowTotal += monthlyTotal

        const annualSalary = incomeConfig.annual_salary
        const bonus = incomeConfig.bonus_estimate ?? 0
        const totalAnnual = annualSalary + bonus
        const salaryPct = totalAnnual > 0 ? annualSalary / totalAnnual : 1

        const salary = Math.round(monthlyTotal * salaryPct * 100) / 100
        const bonusMonthly =
          bonus > 0 ? Math.round(monthlyTotal * (1 - salaryPct) * 100) / 100 : 0

        inflowBreakdown.salary = (inflowBreakdown.salary ?? 0) + salary
        if (bonus > 0) {
          inflowBreakdown.bonus = (inflowBreakdown.bonus ?? 0) + bonusMonthly
        }
      }
    }

    // Outflow
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

  // Shared ILP
  ilp += sumIlpPremiums(sharedIlpRes.data)

  const outflowTotal =
    discretionary + insurance + ilp + loans + tax + savingsGoals
  const netSavings = inflowTotal - outflowTotal

  const round = (n: number) => Math.round(n * 100) / 100

  const roundedInflowBreakdown =
    Object.keys(inflowBreakdown).length > 0
      ? Object.fromEntries(
          Object.entries(inflowBreakdown).map(([k, v]) => [k, round(v ?? 0)])
        )
      : undefined

  return {
    month,
    inflowTotal: round(inflowTotal),
    inflowBreakdown: roundedInflowBreakdown,
    outflowTotal: round(outflowTotal),
    outflowBreakdown: {
      discretionary: round(discretionary),
      insurance: round(insurance),
      ilp: round(ilp),
      loans: round(loans),
      tax: round(tax),
      savingsGoals: round(savingsGoals),
    },
    netSavings: round(netSavings),
  }
}
