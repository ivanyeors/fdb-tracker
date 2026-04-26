/**
 * Batch data loader for the /api/developer/money-flow route.
 *
 * Computes real dollar amounts for all 23 graph nodes and flow formulas
 * for all edges, reusing existing calculation functions.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  MoneyFlowPayload,
  MoneyFlowNodeData,
  MoneyFlowEdgeData,
} from "@/lib/developer/money-flow-types"
import { GRAPH_LINKS } from "@/lib/developer/calculation-graph-data"
import {
  buildGiroOutflowByProfile,
  discretionaryForProfileMonth,
  effectiveInflowFromContext,
  monthlyTaxForProfile,
  normalizeMonthKey,
  sumIlpPremiums,
  sumInsuranceOutflowPremiumsSplit,
  sumLoanMonthlyPayments,
  sumEarlyRepaymentsForMonth,
  sumGoalContributionsForMonth,
  sumOneTimeIlpForMonth,
  sumTaxReliefCashForMonth,
  sumNetInvestmentPurchasesForMonth,
  GIRO_OUTFLOW_DESTINATIONS,
  type CashflowRow,
  type IncomeData,
  type InsurancePolicy,
  type ProfileData,
  type TaxEntryData,
} from "@/lib/api/cashflow-aggregation"
import { decodeCpfBalancesPii } from "@/lib/repos/cpf-balances"
import { decodeCpfHealthcareConfigPii } from "@/lib/repos/cpf-healthcare-config"
import { decodeIncomeConfigPii } from "@/lib/repos/income-config"
import { decodeInsurancePoliciesPii } from "@/lib/repos/insurance-policies"
import { decodeLoanPii } from "@/lib/repos/loans"
import { decodeMonthlyCashflowPii } from "@/lib/repos/monthly-cashflow"
import { decodeTaxGiroSchedulePii } from "@/lib/repos/tax-giro-schedule"
import { decodeTaxReliefInputsPii } from "@/lib/repos/tax-relief-inputs"
import { getAge, calculateCpfContribution } from "@/lib/calculations/cpf"
import {
  calculateSelfHelpContribution,
  type SelfHelpGroup,
} from "@/lib/calculations/self-help-group"
import {
  estimateOutstandingPrincipal,
  loanMonthlyPayment,
} from "@/lib/calculations/loans"
import { computeTotalInvestmentsValue } from "@/lib/api/net-liquid"
import {
  calculateTax,
  type ProfileForTax,
  type InsurancePolicyForTax,
  type ManualReliefInput,
  type DependentForTax,
  type SpouseForTax,
} from "@/lib/calculations/tax"
import {
  getAnnualHealthcareMaDeduction,
  type CpfHealthcareConfig,
} from "@/lib/calculations/cpf-healthcare"
import { calculateGiroSchedule, getNextGiroPaymentIndex } from "@/lib/calculations/tax-giro"

export type MoneyFlowParams = {
  profileIds: string[]
  familyId: string
  profileId: string | null
}

function fmt(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`
  }
  if (abs >= 10_000) {
    return `$${Math.round(value).toLocaleString()}`
  }
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
}

export async function fetchMoneyFlowData(
  supabase: SupabaseClient,
  params: MoneyFlowParams
): Promise<MoneyFlowPayload> {
  const { profileIds, familyId, profileId } = params
  const targetProfileIds = profileId ? [profileId] : profileIds
  const currentYear = new Date().getFullYear()
  const targetMonth = getCurrentMonth()
  const now = new Date()
  const rangeStart = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, "0")}-01`

  // ── Batch load ALL data in parallel ──
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
    cpfRes,
    bankAccountsRes,
    investmentsResult,
    dependentsRes,
    healthcareConfigRes,
    taxGiroRes,
  ] = await Promise.all([
    supabase
      .from("monthly_cashflow")
      .select(
        "profile_id, month, inflow, inflow_enc, outflow, outflow_enc",
      )
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"])
      .gte("month", rangeStart)
      .order("month", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, birth_year, name, primary_bank_account_id, gender, spouse_profile_id, marital_status, self_help_group")
      .in("id", profileIds.length > 0 ? profileIds : ["__none__"]),
    supabase
      .from("income_config")
      .select("profile_id, annual_salary_enc, bonus_estimate_enc")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
    supabase
      .from("giro_rules")
      .select("id, amount, source_bank_account_id, linked_entity_type")
      .eq("is_active", true)
      .in("destination_type", [...GIRO_OUTFLOW_DESTINATIONS]),
    supabase
      .from("insurance_policies")
      .select(
        "profile_id, premium_amount, premium_amount_enc, frequency, is_active, deduct_from_outflow, type, coverage_amount, coverage_amount_enc, end_date",
      )
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
    supabase
      .from("ilp_products")
      .select("profile_id, monthly_premium, premium_payment_mode")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
    supabase
      .from("loans")
      .select("id, profile_id, principal, principal_enc, rate_pct, tenure_months, start_date, use_cpf_oa")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
    supabase
      .from("tax_relief_inputs")
      .select("profile_id, year, relief_type, amount_enc")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"])
      .in("year", [currentYear, currentYear - 1]),
    supabase
      .from("ilp_products")
      .select("monthly_premium, premium_payment_mode")
      .eq("family_id", familyId)
      .is("profile_id", null),
    supabase
      .from("savings_goals")
      .select("id, profile_id, monthly_auto_amount, target_amount, current_amount")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
    supabase
      .from("cpf_balances")
      .select(
        "profile_id, month, oa, oa_enc, sa, sa_enc, ma, ma_enc",
      )
      .in("profile_id", targetProfileIds.length > 0 ? targetProfileIds : ["__none__"])
      .order("month", { ascending: false }),
    supabase
      .from("bank_accounts")
      .select("id, profile_id, opening_balance, locked_amount, family_id")
      .eq("family_id", familyId),
    computeTotalInvestmentsValue(supabase, familyId, profileId, null),
    supabase
      .from("dependents")
      .select("id, name, birth_year, relationship, claimed_by_profile_id, annual_income, in_full_time_education, living_with_claimant, is_handicapped")
      .eq("family_id", familyId),
    supabase
      .from("cpf_healthcare_config")
      .select(
        "profile_id, msl_annual_override, msl_annual_override_enc, csl_annual, csl_annual_enc, csl_supplement_annual, csl_supplement_annual_enc, isp_annual, isp_annual_enc",
      )
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
    supabase
      .from("tax_giro_schedule")
      .select(
        "profile_id, year, schedule, schedule_enc, total_payable, total_payable_enc, outstanding_balance, outstanding_balance_enc, source",
      )
      .in("profile_id", targetProfileIds.length > 0 ? targetProfileIds : ["__none__"])
      .eq("year", currentYear),
  ])

  // ── Build lookup maps (same pattern as overview-data.ts) ──
  const cashflowByKey = new Map<string, CashflowRow>()
  for (const row of cashflowRes.data ?? []) {
    const m = normalizeMonthKey(row.month as string)
    const key = `${row.profile_id}:${m}`
    if (!cashflowByKey.has(key)) {
      const decoded = decodeMonthlyCashflowPii(row)
      cashflowByKey.set(key, {
        inflow: decoded.inflow,
        outflow: decoded.outflow,
      })
    }
  }

  const profileById = new Map<string, ProfileData & { name: string; gender?: string | null; spouse_profile_id?: string | null; marital_status?: string | null }>()
  for (const p of profilesRes.data ?? []) {
    profileById.set(p.id, {
      birth_year: p.birth_year,
      name: p.name,
      gender: p.gender,
      spouse_profile_id: p.spouse_profile_id,
      marital_status: p.marital_status,
      self_help_group: p.self_help_group,
    })
  }

  const incomeByProfileId = new Map<string, IncomeData>()
  for (const ic of incomeRes.data ?? []) {
    const decoded = decodeIncomeConfigPii(ic)
    incomeByProfileId.set(ic.profile_id, {
      annual_salary: decoded.annual_salary ?? 0,
      bonus_estimate: decoded.bonus_estimate ?? null,
    })
  }

  const giroAccountIds = [
    ...new Set((giroRulesRes.data ?? []).map((r) => r.source_bank_account_id)),
  ]
  const giroAccounts = (bankAccountsRes.data ?? []).filter((a) =>
    giroAccountIds.includes(a.id)
  )
  const giroByProfile = buildGiroOutflowByProfile(
    giroRulesRes.data ?? [],
    giroAccounts,
    profileIds
  )

  const nowDate = new Date().toISOString().slice(0, 10)
  const insuranceByProfile = new Map<string, InsurancePolicy[]>()
  for (const pol of insuranceRes.data ?? []) {
    const pid = pol.profile_id as string
    if (pol.end_date && pol.end_date < nowDate) continue
    const list = insuranceByProfile.get(pid) ?? []
    const decoded = decodeInsurancePoliciesPii(pol)
    list.push({
      premium_amount: decoded.premium_amount ?? 0,
      frequency: pol.frequency,
      is_active: pol.is_active,
      deduct_from_outflow: pol.deduct_from_outflow,
      type: pol.type,
      coverage_amount: decoded.coverage_amount,
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
    Array<{
      id: string
      principal: number
      rate_pct: number
      tenure_months: number
      start_date: string
      use_cpf_oa: boolean
    }>
  >()
  for (const row of loansRes.data ?? []) {
    const pid = row.profile_id as string
    const list = loansByProfile.get(pid) ?? []
    list.push({
      id: row.id,
      principal: decodeLoanPii(row).principal ?? 0,
      rate_pct: row.rate_pct,
      tenure_months: row.tenure_months,
      start_date: row.start_date,
      use_cpf_oa: !!row.use_cpf_oa,
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
    list.push({
      relief_type: tr.relief_type,
      amount: decodeTaxReliefInputsPii(tr).amount ?? 0,
    })
    taxReliefByProfileYear.set(key, list)
  }

  const savingsGoalsByProfile = new Map<string, number>()
  const savingsTargetByProfile = new Map<string, number>()
  const savingsCurrentByProfile = new Map<string, number>()
  for (const g of savingsGoalsRes.data ?? []) {
    const pid = g.profile_id as string
    savingsGoalsByProfile.set(
      pid,
      (savingsGoalsByProfile.get(pid) ?? 0) + ((g.monthly_auto_amount as number) ?? 0)
    )
    savingsTargetByProfile.set(
      pid,
      (savingsTargetByProfile.get(pid) ?? 0) + ((g.target_amount as number) ?? 0)
    )
    savingsCurrentByProfile.set(
      pid,
      (savingsCurrentByProfile.get(pid) ?? 0) + ((g.current_amount as number) ?? 0)
    )
  }

  const sharedIlp = sumIlpPremiums(sharedIlpRes.data)

  // Dependents
  const familyDependents: DependentForTax[] = (dependentsRes.data ?? []).map((d) => ({
    name: d.name,
    birth_year: d.birth_year,
    relationship: d.relationship as "child" | "parent" | "grandparent",
    annual_income: Number(d.annual_income ?? 0),
    in_full_time_education: !!d.in_full_time_education,
    living_with_claimant: !!d.living_with_claimant,
    is_handicapped: !!d.is_handicapped,
    claimed_by_profile_id: d.claimed_by_profile_id,
  }))

  // Healthcare config by profile
  const healthcareByProfile = new Map<string, CpfHealthcareConfig | null>()
  for (const hc of healthcareConfigRes.data ?? []) {
    const decoded = decodeCpfHealthcareConfigPii(hc)
    healthcareByProfile.set(hc.profile_id as string, {
      profileId: hc.profile_id as string,
      mslAnnualOverride: decoded.msl_annual_override,
      cslAnnual: decoded.csl_annual ?? 0,
      cslSupplementAnnual: decoded.csl_supplement_annual ?? 0,
      ispAnnual: decoded.isp_annual ?? 0,
    })
  }

  // ── Compute aggregated values across targeted profiles ──
  let totalGrossMonthly = 0
  let totalBonus = 0
  let totalAnnualSalary = 0
  let totalEmployeeCpf = 0
  let totalEmployerCpf = 0
  let totalCpfOa = 0
  let totalCpfSa = 0
  let totalCpfMa = 0
  let totalSelfHelp = 0
  let totalTakeHome = 0
  let totalInsurancePremium = 0
  let totalIlpPremium = 0
  let totalLoanMonthly = 0
  let totalLoanPrincipal = 0
  let totalSavingsGoalMonthly = 0
  let totalSavingsTarget = 0
  let _totalSavingsCurrent = 0
  let totalTaxPayable = 0
  let totalTaxReliefs = 0
  let totalTaxEmploymentIncome = 0
  let totalCpfBalanceOa = 0
  let totalCpfBalanceSa = 0
  let totalCpfBalanceMa = 0
  let totalHealthcareMsl = 0
  let totalHealthcareCsl = 0
  let totalHealthcarePmi = 0
  let totalHealthcareAnnual = 0
  let totalDependentReliefs = 0
  let dependentChildCount = 0
  let dependentParentCount = 0

  for (const pid of targetProfileIds) {
    const profile = profileById.get(pid)
    const income = incomeByProfileId.get(pid)
    if (!profile || !income) continue

    const monthlyGross = income.annual_salary / 12
    const age = getAge(profile.birth_year, currentYear)
    const cpf = calculateCpfContribution(monthlyGross, age, currentYear)

    totalGrossMonthly += monthlyGross
    totalBonus += income.bonus_estimate ?? 0
    totalAnnualSalary += income.annual_salary
    const shg = calculateSelfHelpContribution(
      monthlyGross,
      (profile.self_help_group as SelfHelpGroup) ?? "none",
    )

    totalEmployeeCpf += cpf.employee
    totalEmployerCpf += cpf.employer
    totalCpfOa += cpf.oa
    totalCpfSa += cpf.sa
    totalCpfMa += cpf.ma
    totalSelfHelp += shg.monthlyAmount
    totalTakeHome += monthlyGross - cpf.employee - shg.monthlyAmount

    // Insurance premiums
    const pols = insuranceByProfile.get(pid) ?? []
    const insSplit = sumInsuranceOutflowPremiumsSplit(pols)
    totalInsurancePremium += insSplit.insurance + insSplit.ilpFromLegacyPolicies

    // ILP premiums
    totalIlpPremium += sumIlpPremiums(ilpByProfile.get(pid) ?? [])

    // Loans
    const profileLoans = loansByProfile.get(pid) ?? []
    for (const loan of profileLoans) {
      if (!loan.use_cpf_oa) {
        totalLoanMonthly += loanMonthlyPayment(loan.principal, loan.rate_pct, loan.tenure_months)
      }
      totalLoanPrincipal += loan.principal
    }

    // Savings goals
    totalSavingsGoalMonthly += savingsGoalsByProfile.get(pid) ?? 0
    totalSavingsTarget += savingsTargetByProfile.get(pid) ?? 0
    _totalSavingsCurrent += savingsCurrentByProfile.get(pid) ?? 0

    // Tax calculation
    const manualReliefs: ManualReliefInput[] =
      (taxReliefByProfileYear.get(`${pid}:${currentYear}`) ?? []).map((r) => ({
        relief_type: r.relief_type,
        amount: r.amount,
      }))

    const polsForTax: InsurancePolicyForTax[] = pols.map((p) => ({
      type: p.type,
      premium_amount: p.premium_amount,
      frequency: p.frequency,
      coverage_amount: p.coverage_amount ?? null,
      is_active: p.is_active ?? true,
    }))

    const profileForTax: ProfileForTax = {
      birth_year: profile.birth_year,
      gender: profile.gender as "male" | "female" | null | undefined,
      spouse_profile_id: profile.spouse_profile_id,
      marital_status: profile.marital_status,
    }

    // Spouse data for tax
    let spouseData: SpouseForTax | null = null
    if (profile.spouse_profile_id) {
      const spouseIncome = incomeByProfileId.get(profile.spouse_profile_id)
      if (spouseIncome) {
        spouseData = { annual_income: spouseIncome.annual_salary + (spouseIncome.bonus_estimate ?? 0) }
      }
    }

    const taxResult = calculateTax({
      profile: profileForTax,
      profileId: pid,
      incomeConfig: { annual_salary: income.annual_salary, bonus_estimate: income.bonus_estimate ?? 0 },
      insurancePolicies: polsForTax,
      manualReliefs,
      spouse: spouseData,
      dependents: familyDependents,
      year: currentYear,
    })

    // Track dependent relief contribution for this profile
    const dependentBreakdown = taxResult.reliefBreakdown?.filter(
      (r) => ["qcr", "wmcr", "parent", "spouse"].includes(r.type) && r.source === "auto"
    ) ?? []
    totalDependentReliefs += dependentBreakdown.reduce((s, r) => s + r.amount, 0)

    totalTaxPayable += taxResult.taxPayable
    totalTaxReliefs += taxResult.totalReliefs
    totalTaxEmploymentIncome += taxResult.employmentIncome

    // CPF balances
    const cpfEntries = (cpfRes.data ?? []).filter((c) => c.profile_id === pid)
    const latestCpf = cpfEntries[0]
    if (latestCpf) {
      const decodedCpf = decodeCpfBalancesPii(latestCpf)
      totalCpfBalanceOa += decodedCpf.oa ?? 0
      totalCpfBalanceSa += decodedCpf.sa ?? 0
      totalCpfBalanceMa += decodedCpf.ma ?? 0
    } else {
      // Project from contributions
      const monthsElapsed = now.getMonth() + 1
      totalCpfBalanceOa += cpf.oa * monthsElapsed
      totalCpfBalanceSa += cpf.sa * monthsElapsed
      totalCpfBalanceMa += cpf.ma * monthsElapsed
    }

    // Healthcare MA deductions
    const hcConfig = healthcareByProfile.get(pid) ?? null
    const hcBreakdown = getAnnualHealthcareMaDeduction(age, hcConfig)
    totalHealthcareMsl += hcBreakdown.msl
    totalHealthcareCsl += hcBreakdown.csl
    totalHealthcarePmi += hcBreakdown.pmi
    totalHealthcareAnnual += hcBreakdown.total
  }

  // Count dependents by type
  for (const d of familyDependents) {
    if (d.relationship === "child") dependentChildCount++
    else dependentParentCount++
  }

  // Add shared ILP to total
  totalIlpPremium += sharedIlp

  // CPF housing (separate query for loan-linked CPF usage)
  let cpfHousingTotal = 0
  const allLoanIds: string[] = []
  for (const pid of targetProfileIds) {
    const profileLoans = loansByProfile.get(pid) ?? []
    for (const loan of profileLoans) {
      if (loan.use_cpf_oa) allLoanIds.push(loan.id)
    }
  }
  if (allLoanIds.length > 0) {
    const { data: housingData } = await supabase
      .from("cpf_housing_usage")
      .select("principal_withdrawn")
      .in("loan_id", allLoanIds)
    for (const row of housingData ?? []) {
      cpfHousingTotal += row.principal_withdrawn ?? 0
    }
  }

  // Loan outstanding balance
  let totalLoanOutstanding = 0
  let totalEarlyRepayment = 0
  const allLoans: Array<{ id: string; principal: number; rate_pct: number }> = []
  for (const pid of targetProfileIds) {
    for (const loan of loansByProfile.get(pid) ?? []) {
      allLoans.push({ id: loan.id, principal: loan.principal, rate_pct: loan.rate_pct })
    }
  }
  if (allLoans.length > 0) {
    const loanIds = allLoans.map((l) => l.id)
    const [{ data: repayments }, { data: earlyRepayments }] = await Promise.all([
      supabase
        .from("loan_repayments")
        .select("loan_id, amount, date")
        .in("loan_id", loanIds)
        .order("date", { ascending: true }),
      supabase
        .from("loan_early_repayments")
        .select("loan_id, amount, date")
        .in("loan_id", loanIds)
        .order("date", { ascending: true }),
    ])

    for (const loan of allLoans) {
      const loanRepayments = (repayments ?? [])
        .filter((r) => r.loan_id === loan.id)
        .map((r) => ({ amount: r.amount, date: r.date }))
      const loanEarlyRepayments = (earlyRepayments ?? [])
        .filter((r) => r.loan_id === loan.id)
        .map((r) => ({ amount: r.amount, date: r.date }))

      totalLoanOutstanding += estimateOutstandingPrincipal(
        loan.principal,
        loan.rate_pct,
        loanRepayments,
        loanEarlyRepayments
      )
      for (const ep of loanEarlyRepayments) {
        totalEarlyRepayment += ep.amount
      }
    }
  }

  // Effective inflow/outflow
  const monthStr = normalizeMonthKey(targetMonth)
  const year = parseInt(monthStr.slice(0, 4), 10) || currentYear

  let totalEffectiveInflow = 0
  let totalEffectiveOutflow = 0
  let totalIlpOneTime = 0
  let _totalEarlyRepaymentOutflow = 0
  let totalTaxReliefCashOutflow = 0
  let totalInvestmentPurchases = 0
  let totalGoalContributions = 0
  let totalDividends = 0
  let totalBankInterest = 0

  // Fetch additional data for new categories
  const loanIdsForEarlyRep = (loansRes.data ?? []).map((l) => l.id as string)
  const goalIdsForContribs = (savingsGoalsRes.data ?? []).map((g) => (g as { id: string }).id)
  const monthDate = new Date(monthStr)
  const nextMonthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)
  const nextMonthStr = nextMonthDate.toISOString().slice(0, 10)

  const [earlyRepsRes, goalContribsRes, oneTimeIlpRes, investTxnsRes, bankInterestRes, divTxnsRes, taxEntriesRes] =
    await Promise.all([
      loanIdsForEarlyRep.length > 0
        ? supabase.from("loan_early_repayments").select("loan_id, amount, penalty_amount, date").in("loan_id", loanIdsForEarlyRep).gte("date", monthStr).lt("date", nextMonthStr)
        : Promise.resolve({ data: [] as Array<{ loan_id: string; amount: number; penalty_amount: number | null; date: string }>, error: null }),
      goalIdsForContribs.length > 0
        ? supabase.from("goal_contributions").select("goal_id, amount, created_at").in("goal_id", goalIdsForContribs).gte("created_at", monthStr).lt("created_at", nextMonthStr)
        : Promise.resolve({ data: [] as Array<{ goal_id: string; amount: number; created_at: string }>, error: null }),
      supabase.from("ilp_products").select("profile_id, monthly_premium, created_at").in("profile_id", targetProfileIds.length > 0 ? targetProfileIds : ["__none__"]).eq("premium_payment_mode", "one_time"),
      supabase.from("investment_transactions").select("profile_id, type, quantity, price, created_at").eq("family_id", familyId).in("type", ["buy", "sell"]).gte("created_at", monthStr).lt("created_at", nextMonthStr),
      supabase.from("bank_accounts").select("opening_balance, interest_rate_pct, profile_id").eq("family_id", familyId),
      supabase.from("investment_transactions").select("profile_id, quantity, price, created_at").eq("family_id", familyId).eq("type", "dividend").gte("created_at", monthStr).lt("created_at", nextMonthStr),
      supabase.from("tax_entries").select("profile_id, year, actual_amount").in("profile_id", targetProfileIds.length > 0 ? targetProfileIds : ["__none__"]).eq("year", year),
    ])

  // Build lookup maps for new data
  const loanProfileMap = new Map<string, string>()
  for (const loan of loansRes.data ?? []) loanProfileMap.set(loan.id as string, loan.profile_id as string)

  const earlyRepsByProfile = new Map<string, Array<{ amount: number; penalty_amount: number | null; date: string }>>()
  for (const er of earlyRepsRes.data ?? []) {
    const pid = loanProfileMap.get(er.loan_id)
    if (!pid) continue
    const list = earlyRepsByProfile.get(pid) ?? []
    list.push(er)
    earlyRepsByProfile.set(pid, list)
  }

  const goalProfileMap = new Map<string, string>()
  for (const g of savingsGoalsRes.data ?? []) goalProfileMap.set((g as { id: string }).id, g.profile_id as string)

  const goalContribsByProfile = new Map<string, Array<{ amount: number; created_at: string }>>()
  for (const gc of goalContribsRes.data ?? []) {
    const pid = goalProfileMap.get(gc.goal_id)
    if (!pid) continue
    const list = goalContribsByProfile.get(pid) ?? []
    list.push(gc)
    goalContribsByProfile.set(pid, list)
  }

  const oneTimeIlpByProfile = new Map<string, Array<{ monthly_premium: number; created_at: string }>>()
  for (const ilpRow of oneTimeIlpRes.data ?? []) {
    const pid = ilpRow.profile_id as string
    const list = oneTimeIlpByProfile.get(pid) ?? []
    list.push(ilpRow)
    oneTimeIlpByProfile.set(pid, list)
  }

  const investTxnsByProfile = new Map<string, Array<{ type: string; quantity: number; price: number; created_at: string }>>()
  for (const txn of investTxnsRes.data ?? []) {
    const pid = txn.profile_id as string
    if (!pid) continue
    const list = investTxnsByProfile.get(pid) ?? []
    list.push(txn)
    investTxnsByProfile.set(pid, list)
  }

  const taxEntryByProfileYear = new Map<string, TaxEntryData>()
  for (const te of taxEntriesRes.data ?? []) {
    taxEntryByProfileYear.set(`${te.profile_id}:${te.year}`, { actual_amount: te.actual_amount })
  }

  // Bank interest estimation
  for (const acct of bankInterestRes.data ?? []) {
    const rate = acct.interest_rate_pct ?? 0
    const balance = acct.opening_balance ?? 0
    if (rate > 0 && balance > 0) {
      totalBankInterest += (balance * rate) / 100 / 12
    }
  }

  // Dividends
  for (const txn of divTxnsRes.data ?? []) {
    totalDividends += txn.quantity * txn.price
  }

  for (const pid of targetProfileIds) {
    totalEffectiveInflow += effectiveInflowFromContext(
      pid,
      monthStr,
      year,
      cashflowByKey,
      profileById,
      incomeByProfileId
    )

    const pols = insuranceByProfile.get(pid) ?? []
    totalEffectiveOutflow += discretionaryForProfileMonth(
      pid,
      monthStr,
      cashflowByKey,
      giroByProfile
    )
    const insSplit = sumInsuranceOutflowPremiumsSplit(pols)
    totalEffectiveOutflow += insSplit.insurance + insSplit.ilpFromLegacyPolicies
    totalEffectiveOutflow += sumIlpPremiums(ilpByProfile.get(pid) ?? [])
    totalEffectiveOutflow += sumLoanMonthlyPayments(
      (loansByProfile.get(pid) ?? []).map((l) => ({
        principal: l.principal,
        rate_pct: l.rate_pct,
        tenure_months: l.tenure_months,
        use_cpf_oa: l.use_cpf_oa,
        start_date: l.start_date,
      })),
      monthStr,
    )
    totalEffectiveOutflow += savingsGoalsByProfile.get(pid) ?? 0
    totalEffectiveOutflow += monthlyTaxForProfile(
      pid,
      year,
      profileById,
      incomeByProfileId,
      pols,
      taxReliefByProfileYear.get(`${pid}:${year}`) ?? [],
      taxEntryByProfileYear,
    )

    // New categories
    const earlyRep = sumEarlyRepaymentsForMonth(earlyRepsByProfile.get(pid) ?? [], monthStr)
    _totalEarlyRepaymentOutflow += earlyRep
    totalEffectiveOutflow += earlyRep

    const goalContrib = sumGoalContributionsForMonth(goalContribsByProfile.get(pid) ?? [], monthStr)
    totalGoalContributions += goalContrib
    totalEffectiveOutflow += goalContrib

    const oneTimeIlp = sumOneTimeIlpForMonth(oneTimeIlpByProfile.get(pid) ?? [], monthStr)
    totalIlpOneTime += oneTimeIlp
    totalEffectiveOutflow += oneTimeIlp

    const taxReliefCash = sumTaxReliefCashForMonth(
      (taxReliefRes.data ?? [])
        .filter((tr) => tr.profile_id === pid)
        .map((tr) => ({
          relief_type: tr.relief_type,
          amount: decodeTaxReliefInputsPii(tr).amount ?? 0,
          year: tr.year as number,
        })),
      year,
    )
    totalTaxReliefCashOutflow += taxReliefCash
    totalEffectiveOutflow += taxReliefCash

    const netInvestments = sumNetInvestmentPurchasesForMonth(investTxnsByProfile.get(pid) ?? [], monthStr)
    totalInvestmentPurchases += netInvestments
    totalEffectiveOutflow += netInvestments
  }
  totalEffectiveOutflow += sharedIlp

  // Investments
  const { netLiquidValue, ilpFundTotal } = investmentsResult

  // Bank total (simplified — use effective inflow/outflow difference as proxy)
  // For the graph, we show the bank balance from the overview-style calculation
  // We'll use a simpler approach: sum opening balances
  let bankTotal = 0
  const filteredAccounts = profileId
    ? (bankAccountsRes.data ?? []).filter(
        (a) => a.family_id === familyId && (a.profile_id === profileId || a.profile_id === null)
      )
    : (bankAccountsRes.data ?? []).filter((a) => a.family_id === familyId)
  for (const acct of filteredAccounts) {
    bankTotal += (acct.opening_balance ?? 0) - (acct.locked_amount ?? 0)
  }

  // CPF total
  const cpfTotal = totalCpfBalanceOa + totalCpfBalanceSa + totalCpfBalanceMa

  // Monthly tax provision
  const monthlyTax = totalTaxPayable / 12

  // OCBC 360 interest estimate (simplified)
  const ocbc360AnnualRate = 0.04 // ~4% effective for bonus conditions
  const ocbc360MonthlyInterest = bankTotal * ocbc360AnnualRate / 12

  // ── Build node data ──
  const nodes: Record<string, MoneyFlowNodeData> = {}
  const totalCpfMonthly = totalEmployeeCpf + totalEmployerCpf

  nodes["income"] = {
    amount: `${fmt(totalGrossMonthly)}/mth`,
    breakdown: totalBonus > 0 ? `+ ${fmt(totalBonus)} bonus/yr` : undefined,
    rawAmount: totalGrossMonthly,
    period: "monthly",
  }

  nodes["cpf_alloc"] = {
    amount: `${fmt(totalCpfMonthly)}/mth`,
    breakdown: `OA ${fmt(totalCpfOa)} / SA ${fmt(totalCpfSa)} / MA ${fmt(totalCpfMa)}`,
    rawAmount: totalCpfMonthly,
    period: "monthly",
  }

  nodes["cpf_balance"] = {
    amount: fmt(cpfTotal),
    breakdown: `OA ${fmt(totalCpfBalanceOa)} / SA ${fmt(totalCpfBalanceSa)} / MA ${fmt(totalCpfBalanceMa)}`,
    rawAmount: cpfTotal,
    period: "total",
  }

  nodes["cpf_retirement"] = {
    amount: fmt(cpfTotal),
    breakdown: "Projected from current balances",
    rawAmount: cpfTotal,
    period: "total",
  }

  nodes["cpf_housing"] = {
    amount: cpfHousingTotal > 0 ? `${fmt(cpfHousingTotal)} used` : "$0",
    rawAmount: cpfHousingTotal,
    period: "total",
  }

  nodes["bank_balance"] = {
    amount: fmt(bankTotal),
    breakdown: `${filteredAccounts.length} account${filteredAccounts.length !== 1 ? "s" : ""}`,
    rawAmount: bankTotal,
    period: "total",
  }

  nodes["ocbc360"] = {
    amount: `${fmt(Math.round(ocbc360MonthlyInterest))}/mth`,
    breakdown: `~${(ocbc360AnnualRate * 100).toFixed(1)}% effective p.a.`,
    rawAmount: ocbc360MonthlyInterest,
    period: "monthly",
  }

  nodes["bank_forecast"] = {
    amount: fmt(bankTotal + (totalEffectiveInflow - totalEffectiveOutflow) * 6),
    breakdown: "6-month projection",
    rawAmount: bankTotal + (totalEffectiveInflow - totalEffectiveOutflow) * 6,
    period: "total",
  }

  nodes["loan_principal"] = {
    amount: fmt(totalLoanPrincipal),
    rawAmount: totalLoanPrincipal,
    period: "total",
  }

  nodes["loan_monthly"] = {
    amount: `${fmt(totalLoanMonthly)}/mth`,
    rawAmount: totalLoanMonthly,
    period: "monthly",
  }

  nodes["loan_outstanding"] = {
    amount: fmt(totalLoanOutstanding),
    rawAmount: totalLoanOutstanding,
    period: "total",
  }

  nodes["early_repayment"] = {
    amount: totalEarlyRepayment > 0 ? fmt(totalEarlyRepayment) : "$0",
    breakdown: totalEarlyRepayment > 0 ? "Total early repayments" : "No early repayments",
    rawAmount: totalEarlyRepayment,
    period: "total",
  }

  nodes["tax_income"] = {
    amount: `${fmt(totalTaxEmploymentIncome)}/yr`,
    breakdown: `Salary ${fmt(totalAnnualSalary)} + Bonus ${fmt(totalBonus)}`,
    rawAmount: totalTaxEmploymentIncome,
    period: "annual",
  }

  nodes["tax_reliefs"] = {
    amount: `${fmt(totalTaxReliefs)}/yr`,
    rawAmount: totalTaxReliefs,
    period: "annual",
  }

  nodes["tax_payable"] = {
    amount: `${fmt(totalTaxPayable)}/yr`,
    breakdown: `${fmt(Math.round(monthlyTax))}/mth provision`,
    rawAmount: totalTaxPayable,
    period: "annual",
  }

  nodes["cashflow_in"] = {
    amount: `${fmt(totalEffectiveInflow)}/mth`,
    rawAmount: totalEffectiveInflow,
    period: "monthly",
  }

  nodes["cashflow_out"] = {
    amount: `${fmt(totalEffectiveOutflow)}/mth`,
    rawAmount: totalEffectiveOutflow,
    period: "monthly",
  }

  nodes["ilp_premium"] = {
    amount: `${fmt(totalIlpPremium)}/mth`,
    rawAmount: totalIlpPremium,
    period: "monthly",
  }

  nodes["ilp_value"] = {
    amount: fmt(ilpFundTotal),
    rawAmount: ilpFundTotal,
    period: "total",
  }

  nodes["investments"] = {
    amount: fmt(netLiquidValue),
    breakdown: "Net liquid value",
    rawAmount: netLiquidValue,
    period: "total",
  }

  nodes["insurance_premium"] = {
    amount: `${fmt(totalInsurancePremium)}/mth`,
    rawAmount: totalInsurancePremium,
    period: "monthly",
  }

  nodes["insurance_coverage"] = {
    amount: totalAnnualSalary > 0 ? `${fmt(totalAnnualSalary * 9)} needed` : "$0",
    breakdown: "Death coverage benchmark (9× salary)",
    rawAmount: totalAnnualSalary * 9,
    period: "total",
  }

  nodes["savings_goals"] = {
    amount: totalSavingsTarget > 0 ? fmt(totalSavingsTarget) : "$0",
    breakdown: totalSavingsGoalMonthly > 0
      ? `${fmt(totalSavingsGoalMonthly)}/mth auto + ${fmt(totalGoalContributions)} manual`
      : totalGoalContributions > 0
        ? `${fmt(totalGoalContributions)} manual this month`
        : undefined,
    rawAmount: totalSavingsTarget,
    period: "total",
  }

  nodes["ilp_one_time"] = {
    amount: totalIlpOneTime > 0 ? fmt(totalIlpOneTime) : "$0",
    breakdown: totalIlpOneTime > 0 ? "One-time ILP payment this month" : "No one-time ILPs",
    rawAmount: totalIlpOneTime,
    period: "monthly",
  }

  nodes["tax_relief_cash"] = {
    amount: totalTaxReliefCashOutflow > 0 ? `${fmt(totalTaxReliefCashOutflow)}/mth` : "$0",
    breakdown: "SRS + CPF voluntary top-ups (real cash out)",
    rawAmount: totalTaxReliefCashOutflow,
    period: "monthly",
  }

  nodes["dividends"] = {
    amount: totalDividends > 0 ? fmt(totalDividends) : "$0",
    breakdown: totalDividends > 0 ? "Dividend income this month" : "No dividends",
    rawAmount: totalDividends,
    period: "monthly",
  }

  nodes["investment_purchases"] = {
    amount: totalInvestmentPurchases > 0 ? `${fmt(totalInvestmentPurchases)}/mth` : "$0",
    breakdown: "Net stock/ETF buys this month",
    rawAmount: totalInvestmentPurchases,
    period: "monthly",
  }

  nodes["bank_interest"] = {
    amount: totalBankInterest > 0 ? `${fmt(Math.round(totalBankInterest))}/mth` : "$0",
    breakdown: "Estimated from account rates",
    rawAmount: totalBankInterest,
    period: "monthly",
  }

  nodes["take_home"] = {
    amount: `${fmt(totalTakeHome)}/mth`,
    breakdown: totalSelfHelp > 0
      ? `Gross ${fmt(totalGrossMonthly)} - CPF ${fmt(totalEmployeeCpf)} - SHG ${fmt(totalSelfHelp)}`
      : `Gross ${fmt(totalGrossMonthly)} - CPF ${fmt(totalEmployeeCpf)}`,
    rawAmount: totalTakeHome,
    period: "monthly",
  }

  nodes["shg_deduction"] = {
    amount: totalSelfHelp > 0 ? `${fmt(totalSelfHelp)}/mth` : "$0",
    breakdown: totalSelfHelp > 0 ? "CDAC/SINDA/MBMF/ECF deduction" : "No SHG fund selected",
    rawAmount: totalSelfHelp,
    period: "monthly",
  }

  // Healthcare MA deductions
  const healthcareMonthly = Math.round((totalHealthcareAnnual / 12) * 100) / 100
  nodes["cpf_healthcare"] = {
    amount: totalHealthcareAnnual > 0 ? `${fmt(totalHealthcareAnnual)}/yr` : "$0",
    breakdown: totalHealthcareAnnual > 0
      ? `MSL ${fmt(totalHealthcareMsl)} / CSL ${fmt(totalHealthcareCsl)} / ISP ${fmt(totalHealthcarePmi)} · ${fmt(healthcareMonthly)}/mth from MA`
      : "No healthcare config",
    rawAmount: totalHealthcareAnnual,
    period: "annual",
  }

  // Tax GIRO schedule
  const giroScheduleRows = taxGiroRes.data ?? []
  let giroMonthlyBase = 0
  let giroNextLabel = ""
  if (giroScheduleRows.length > 0) {
    // Sum across profiles
    let giroTotal = 0
    for (const row of giroScheduleRows) {
      const decoded = decodeTaxGiroSchedulePii(row)
      giroTotal += Number(decoded.total_payable ?? 0)
    }
    giroMonthlyBase = Math.floor((giroTotal / 12) * 100) / 100
    // Use first profile's schedule for next-payment display
    const firstSchedule = giroScheduleRows[0]
      ? (decodeTaxGiroSchedulePii(giroScheduleRows[0]).schedule as
          | Array<{ month: string; amount: number }>
          | null)
      : null
    if (firstSchedule) {
      const nextIdx = getNextGiroPaymentIndex(firstSchedule)
      giroNextLabel = nextIdx >= 0 ? `Next: ${firstSchedule[nextIdx].month}` : "All paid"
    }
  } else if (totalTaxPayable > 0) {
    // No stored schedule — calculate from tax payable
    const computed = calculateGiroSchedule({ taxPayable: totalTaxPayable, year: currentYear })
    giroMonthlyBase = computed.monthlyBase
    const nextIdx = getNextGiroPaymentIndex(computed.schedule)
    giroNextLabel = nextIdx >= 0 ? `Next: ${computed.schedule[nextIdx].month}` : "All paid"
  }
  nodes["tax_giro"] = {
    amount: giroMonthlyBase > 0 ? `${fmt(giroMonthlyBase)}/mth × 12` : "$0",
    breakdown: giroNextLabel || "No GIRO schedule",
    rawAmount: giroMonthlyBase,
    period: "monthly",
  }

  // Family dependents
  const depTotal = dependentChildCount + dependentParentCount
  nodes["dependents"] = {
    amount: depTotal > 0 ? `${depTotal} dependent${depTotal !== 1 ? "s" : ""}` : "None",
    breakdown: depTotal > 0
      ? [
          dependentChildCount > 0 ? `${dependentChildCount} child${dependentChildCount !== 1 ? "ren" : ""}` : "",
          dependentParentCount > 0 ? `${dependentParentCount} parent${dependentParentCount !== 1 ? "s" : ""}` : "",
        ].filter(Boolean).join(", ") + (totalDependentReliefs > 0 ? ` · ${fmt(totalDependentReliefs)}/yr relief` : "")
      : undefined,
    rawAmount: totalDependentReliefs,
    period: "annual",
  }

  // ── Build edge flow formulas ──
  const edges: Record<string, MoneyFlowEdgeData> = {}

  // Map edge IDs to their graph links for formula generation
  GRAPH_LINKS.forEach((link, i) => {
    const edgeId = `e-${link.source}-${link.target}-${i}`
    const sourceData = nodes[link.source]
    const targetData = nodes[link.target]

    if (!sourceData || !targetData) {
      edges[edgeId] = { flowFormula: link.calculationName, rawAmount: 0 }
      return
    }

    // Generate contextual formula based on the specific edge
    const formula = generateEdgeFormula(
      link.source,
      link.target,
      link.calculationName,
      sourceData,
      targetData,
      {
        grossMonthly: totalGrossMonthly,
        employeeCpf: totalEmployeeCpf,
        employerCpf: totalEmployerCpf,
        cpfTotal: totalCpfMonthly,
        selfHelp: totalSelfHelp,
        takeHome: totalTakeHome,
        taxPayable: totalTaxPayable,
        taxReliefs: totalTaxReliefs,
        employmentIncome: totalTaxEmploymentIncome,
        loanMonthly: totalLoanMonthly,
        insurancePremium: totalInsurancePremium,
        ilpPremium: totalIlpPremium,
        monthlyTax: monthlyTax,
        healthcareMonthly,
        dependentReliefs: totalDependentReliefs,
        giroMonthlyBase,
        childCount: dependentChildCount,
        parentCount: dependentParentCount,
      }
    )

    edges[edgeId] = formula
  })

  // Profile label
  const profileNames = targetProfileIds
    .map((pid) => profileById.get(pid)?.name ?? "")
    .filter(Boolean)
  const profileLabel = profileNames.length > 0
    ? profileNames.join(" & ")
    : "Combined"

  return {
    nodes,
    edges,
    month: targetMonth,
    profileLabel,
  }
}

function generateEdgeFormula(
  sourceId: string,
  targetId: string,
  calcName: string,
  sourceData: MoneyFlowNodeData,
  targetData: MoneyFlowNodeData,
  ctx: {
    grossMonthly: number
    employeeCpf: number
    employerCpf: number
    cpfTotal: number
    selfHelp: number
    takeHome: number
    taxPayable: number
    taxReliefs: number
    employmentIncome: number
    loanMonthly: number
    insurancePremium: number
    ilpPremium: number
    monthlyTax: number
    healthcareMonthly: number
    dependentReliefs: number
    giroMonthlyBase: number
    childCount: number
    parentCount: number
  }
): MoneyFlowEdgeData {
  const key = `${sourceId}->${targetId}`

  switch (key) {
    case "income->cpf_alloc":
      return {
        flowFormula: `${fmt(ctx.grossMonthly)} × 37% = ${fmt(ctx.cpfTotal)}`,
        rawAmount: ctx.cpfTotal,
      }
    case "income->tax_income":
      return {
        flowFormula: `${fmt(ctx.employmentIncome)}/yr gross`,
        rawAmount: ctx.employmentIncome,
      }
    case "income->take_home":
      return {
        flowFormula: ctx.selfHelp > 0
          ? `${fmt(ctx.grossMonthly)} - ${fmt(ctx.employeeCpf)} CPF - ${fmt(ctx.selfHelp)} SHG = ${fmt(ctx.takeHome)}`
          : `${fmt(ctx.grossMonthly)} - ${fmt(ctx.employeeCpf)} CPF = ${fmt(ctx.takeHome)}`,
        rawAmount: ctx.takeHome,
      }
    case "income->shg_deduction":
      return {
        flowFormula: ctx.selfHelp > 0
          ? `${fmt(ctx.grossMonthly)} → ${fmt(ctx.selfHelp)}/mth SHG`
          : "No SHG fund",
        rawAmount: ctx.selfHelp,
      }
    case "shg_deduction->take_home":
      return {
        flowFormula: ctx.selfHelp > 0
          ? `-${fmt(ctx.selfHelp)}/mth deducted`
          : "$0 SHG deduction",
        rawAmount: ctx.selfHelp,
      }
    case "income->insurance_coverage":
      return {
        flowFormula: `Salary × 9 = ${fmt(ctx.employmentIncome * 9 / 12 * 12)}`,
        rawAmount: ctx.employmentIncome,
      }
    case "cpf_alloc->cpf_balance":
      return {
        flowFormula: `${fmt(ctx.cpfTotal)}/mth accumulates`,
        rawAmount: ctx.cpfTotal,
      }
    case "cpf_alloc->tax_reliefs":
      return {
        flowFormula: `${fmt(ctx.employeeCpf * 12)}/yr CPF relief`,
        rawAmount: ctx.employeeCpf * 12,
      }
    case "cpf_balance->cpf_retirement":
      return {
        flowFormula: `${fmt(sourceData.rawAmount)} + future contributions`,
        rawAmount: sourceData.rawAmount,
      }
    case "cpf_balance->cpf_housing":
      return {
        flowFormula: `OA withdrawals for housing`,
        rawAmount: targetData.rawAmount,
      }
    case "cpf_housing->loan_monthly":
      return {
        flowFormula: `CPF OA → loan repayment`,
        rawAmount: targetData.rawAmount,
      }
    case "take_home->cashflow_in":
      return {
        flowFormula: `${fmt(ctx.takeHome)}/mth inflow`,
        rawAmount: ctx.takeHome,
      }
    case "tax_income->tax_payable":
      return {
        flowFormula: `${fmt(ctx.employmentIncome)} - ${fmt(ctx.taxReliefs)} reliefs → ${fmt(ctx.taxPayable)} tax`,
        rawAmount: ctx.taxPayable,
      }
    case "tax_reliefs->tax_payable":
      return {
        flowFormula: `-${fmt(ctx.taxReliefs)} reduces chargeable income`,
        rawAmount: ctx.taxReliefs,
      }
    case "insurance_premium->tax_reliefs":
      return {
        flowFormula: `Life premium → tax relief`,
        rawAmount: ctx.insurancePremium * 12,
      }
    case "insurance_premium->cashflow_out":
      return {
        flowFormula: `${fmt(ctx.insurancePremium)}/mth premiums`,
        rawAmount: ctx.insurancePremium,
      }
    case "ilp_premium->cashflow_out":
      return {
        flowFormula: `${fmt(ctx.ilpPremium)}/mth ILP premiums`,
        rawAmount: ctx.ilpPremium,
      }
    case "ilp_premium->ilp_value":
      return {
        flowFormula: `${fmt(ctx.ilpPremium)}/mth → fund accumulation`,
        rawAmount: ctx.ilpPremium,
      }
    case "loan_monthly->cashflow_out":
      return {
        flowFormula: `${fmt(ctx.loanMonthly)}/mth repayment`,
        rawAmount: ctx.loanMonthly,
      }
    case "loan_principal->loan_monthly":
      return {
        flowFormula: `P × r(1+r)^n / [(1+r)^n - 1]`,
        rawAmount: ctx.loanMonthly,
      }
    case "loan_principal->loan_outstanding":
      return {
        flowFormula: `${fmt(sourceData.rawAmount)} - repayments = ${fmt(targetData.rawAmount)}`,
        rawAmount: targetData.rawAmount,
      }
    case "early_repayment->loan_outstanding":
      return {
        flowFormula: `-${fmt(sourceData.rawAmount)} principal reduction`,
        rawAmount: sourceData.rawAmount,
      }
    case "cashflow_out->ocbc360":
      return {
        flowFormula: `Spend ≥ $500 → bonus rate`,
        rawAmount: 0,
      }
    case "cashflow_in->ocbc360":
      return {
        flowFormula: `Salary ≥ $1,800 → bonus rate`,
        rawAmount: 0,
      }
    case "bank_balance->ocbc360":
      return {
        flowFormula: `Balance × tiered rates`,
        rawAmount: targetData.rawAmount,
      }
    case "ocbc360->bank_forecast":
      return {
        flowFormula: `${fmt(Math.round(targetData.rawAmount - sourceData.rawAmount))} projected growth`,
        rawAmount: targetData.rawAmount,
      }
    case "cashflow_in->bank_forecast":
      return {
        flowFormula: `+${fmt(sourceData.rawAmount)}/mth inflow`,
        rawAmount: sourceData.rawAmount,
      }
    case "cashflow_out->bank_forecast":
      return {
        flowFormula: `-${fmt(sourceData.rawAmount)}/mth outflow`,
        rawAmount: sourceData.rawAmount,
      }
    case "bank_balance->savings_goals":
      return {
        flowFormula: `Bank funds → goal progress`,
        rawAmount: 0,
      }
    case "investments->savings_goals":
      return {
        flowFormula: `${fmt(sourceData.rawAmount)} investment value`,
        rawAmount: sourceData.rawAmount,
      }
    case "cpf_healthcare->cpf_balance":
      return {
        flowFormula: ctx.healthcareMonthly > 0
          ? `${fmt(ctx.healthcareMonthly)}/mth deducted from MA`
          : "No healthcare deductions",
        rawAmount: ctx.healthcareMonthly,
      }
    case "cpf_healthcare->cpf_retirement":
      return {
        flowFormula: ctx.healthcareMonthly > 0
          ? `${fmt(ctx.healthcareMonthly)}/mth reduces MA projection`
          : "No healthcare deductions",
        rawAmount: ctx.healthcareMonthly,
      }
    case "tax_payable->tax_giro":
      return {
        flowFormula: ctx.giroMonthlyBase > 0
          ? `${fmt(ctx.taxPayable)} ÷ 12 = ${fmt(ctx.giroMonthlyBase)}/mth GIRO`
          : "No GIRO schedule",
        rawAmount: ctx.giroMonthlyBase,
      }
    case "dependents->tax_reliefs":
      return {
        flowFormula: ctx.dependentReliefs > 0
          ? `${fmt(ctx.dependentReliefs)}/yr from ${[ctx.childCount > 0 ? `${ctx.childCount} child${ctx.childCount !== 1 ? "ren" : ""}` : "", ctx.parentCount > 0 ? `${ctx.parentCount} parent${ctx.parentCount !== 1 ? "s" : ""}` : ""].filter(Boolean).join(" + ")}`
          : "No dependent reliefs",
        rawAmount: ctx.dependentReliefs,
      }
    case "income->tax_reliefs":
      return {
        flowFormula: `Spouse relief: $2,000 (if eligible)`,
        rawAmount: 2000,
      }
    default:
      return {
        flowFormula: `${fmt(sourceData.rawAmount)} → ${fmt(targetData.rawAmount)}`,
        rawAmount: targetData.rawAmount,
      }
  }
}
