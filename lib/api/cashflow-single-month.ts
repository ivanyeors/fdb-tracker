/**
 * Batched single-month cashflow with inflow/outflow breakdown.
 * Replaces the N+1 per-profile loop in the cashflow waterfall mode.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { calculateTakeHome } from "@/lib/calculations/take-home"
import type { SelfHelpGroup } from "@/lib/calculations/self-help-group"
import { computeBankTotal } from "@/lib/calculations/computed-bank-balance"
import { getAge, calculateCpfContribution } from "@/lib/calculations/cpf"
import type {
  InvestmentWaterfallSection,
  CpfWaterfallSection,
} from "@/components/dashboard/cashflow/waterfall-chart"
import {
  buildGiroOutflowByProfile,
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
  rawNetDeploymentForMonth,
  GIRO_OUTFLOW_DESTINATIONS,
  type CashflowRow,
  type IncomeData,
  type InsurancePolicy,
  type ProfileData,
  type TaxEntryData,
} from "@/lib/api/cashflow-aggregation"
import { decodeCpfBalancesPii } from "@/lib/repos/cpf-balances"
import { decodeIncomeConfigPii } from "@/lib/repos/income-config"
import { decodeInsurancePoliciesPii } from "@/lib/repos/insurance-policies"
import { decodeLoanPii } from "@/lib/repos/loans"
import { decodeMonthlyCashflowPii } from "@/lib/repos/monthly-cashflow"
import { decodeTaxReliefInputsPii } from "@/lib/repos/tax-relief-inputs"

type SingleMonthResult = {
  month: string
  startingBankBalance?: number
  endingBankBalance?: number
  inflowTotal: number
  inflowBreakdown?: Record<string, number>
  outflowTotal: number
  outflowBreakdown: {
    discretionary: number
    insurance: number
    ilp: number
    ilpOneTime: number
    loans: number
    earlyRepayments: number
    tax: number
    taxReliefCash: number
    savingsGoals: number
    investments: number
    giroTransfers: number
  }
  netSavings: number
  investments?: InvestmentWaterfallSection
  cpf?: CpfWaterfallSection
  subBreakdowns?: Record<string, Array<{ label: string; amount: number }>>
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
      .select(
        "profile_id, month, inflow, inflow_enc, outflow, outflow_enc",
      )
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"])
      .eq("month", monthStr),
    supabase
      .from("profiles")
      .select("id, birth_year, name, self_help_group")
      .in("id", profileIds.length > 0 ? profileIds : ["__none__"]),
    supabase
      .from("income_config")
      .select(
        "profile_id, annual_salary, annual_salary_enc, bonus_estimate, bonus_estimate_enc",
      )
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
    supabase
      .from("giro_rules")
      .select("id, amount, source_bank_account_id, linked_entity_type")
      .eq("is_active", true)
      .in("destination_type", [...GIRO_OUTFLOW_DESTINATIONS]),
    supabase
      .from("insurance_policies")
      .select(
        "profile_id, name, premium_amount, premium_amount_enc, frequency, is_active, deduct_from_outflow, type, coverage_amount, coverage_amount_enc, end_date",
      )
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
    supabase
      .from("ilp_products")
      .select("id, profile_id, name, monthly_premium, premium_payment_mode")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
    supabase
      .from("loans")
      .select("id, profile_id, name, principal, principal_enc, rate_pct, tenure_months, start_date, use_cpf_oa")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
    supabase
      .from("tax_relief_inputs")
      .select("profile_id, year, relief_type, amount, amount_enc")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"])
      .eq("year", year),
    supabase
      .from("ilp_products")
      .select("id, name, monthly_premium, premium_payment_mode")
      .eq("family_id", familyId)
      .is("profile_id", null),
    supabase
      .from("savings_goals")
      .select("id, profile_id, name, monthly_auto_amount")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
  ])

  // Additional fetches that depend on first batch results
  const allLoanIds = (loansRes.data ?? []).map((l) => (l as { id: string }).id)
  const allGoalIds = (savingsGoalsRes.data ?? []).map((g) => (g as { id: string }).id)
  const allIlpProductIds = [
    ...(ilpRes.data ?? []).map((p) => (p as { id?: string }).id).filter(Boolean),
    ...(sharedIlpRes.data ?? []).map((p) => (p as { id?: string }).id).filter(Boolean),
  ] as string[]
  const monthDate = new Date(monthStr)
  const nextMonthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)
  const nextMonthStr = nextMonthDate.toISOString().slice(0, 10)

  const prevMonthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1)
  const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}-01`

  const [earlyRepaymentsRes, goalContributionsRes, oneTimeIlpRes, investmentTxnsRes, bankAccountsForInterestRes, dividendTxnsRes, invSnapshotStartRes, invSnapshotEndRes, cpfBalancesRes, ilpEntriesStartRes, ilpEntriesEndRes] =
    await Promise.all([
      allLoanIds.length > 0
        ? supabase
            .from("loan_early_repayments")
            .select("loan_id, amount, penalty_amount, date")
            .in("loan_id", allLoanIds)
            .gte("date", monthStr)
            .lt("date", nextMonthStr)
        : Promise.resolve({ data: [] as Array<{ loan_id: string; amount: number; penalty_amount: number | null; date: string }>, error: null }),
      allGoalIds.length > 0
        ? supabase
            .from("goal_contributions")
            .select("goal_id, amount, created_at")
            .in("goal_id", allGoalIds)
            .gte("created_at", monthStr)
            .lt("created_at", nextMonthStr)
        : Promise.resolve({ data: [] as Array<{ goal_id: string; amount: number; created_at: string }>, error: null }),
      supabase
        .from("ilp_products")
        .select("profile_id, name, monthly_premium, created_at")
        .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"])
        .eq("premium_payment_mode", "one_time"),
      (() => {
        let q = supabase
          .from("investment_transactions")
          .select("profile_id, symbol, type, quantity, price, commission, account_id, created_at")
          .eq("family_id", familyId)
          .in("type", ["buy", "sell"])
          .gte("created_at", monthStr)
          .lt("created_at", nextMonthStr)
        if (profileIds.length === 1) q = q.eq("profile_id", profileIds[0]!)
        return q
      })(),
      // Bank accounts for interest estimation
      supabase
        .from("bank_accounts")
        .select("profile_id, opening_balance, interest_rate_pct")
        .eq("family_id", familyId),
      // Dividend transactions for the month
      (() => {
        let q = supabase
          .from("investment_transactions")
          .select("profile_id, quantity, price")
          .eq("family_id", familyId)
          .eq("type", "dividend")
          .gte("created_at", monthStr)
          .lt("created_at", nextMonthStr)
        if (profileIds.length === 1) q = q.eq("profile_id", profileIds[0]!)
        return q
      })(),
      // Investment snapshot: last entry before month start
      (() => {
        let q = supabase
          .from("investment_snapshots")
          .select("total_value")
          .eq("family_id", familyId)
          .lt("date", monthStr)
          .order("date", { ascending: false })
          .limit(1)
        if (profileIds.length === 1) q = q.eq("profile_id", profileIds[0]!)
        else q = q.is("profile_id", null)
        return q
      })(),
      // Investment snapshot: last entry before month end
      (() => {
        let q = supabase
          .from("investment_snapshots")
          .select("total_value")
          .eq("family_id", familyId)
          .lt("date", nextMonthStr)
          .order("date", { ascending: false })
          .limit(1)
        if (profileIds.length === 1) q = q.eq("profile_id", profileIds[0]!)
        else q = q.is("profile_id", null)
        return q
      })(),
      // CPF balances for prev month and target month
      supabase
        .from("cpf_balances")
        .select(
          "profile_id, month, oa, oa_enc, sa, sa_enc, ma, ma_enc",
        )
        .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"])
        .in("month", [prevMonthStr, monthStr]),
      // ILP fund values at start of month (latest per product before monthStr)
      allIlpProductIds.length > 0
        ? supabase
            .from("ilp_entries")
            .select("product_id, fund_value, month")
            .in("product_id", allIlpProductIds)
            .lt("month", monthStr)
            .order("month", { ascending: false })
        : Promise.resolve({ data: [] as Array<{ product_id: string; fund_value: number; month: string }>, error: null }),
      // ILP fund values at end of month (latest per product before nextMonthStr)
      allIlpProductIds.length > 0
        ? supabase
            .from("ilp_entries")
            .select("product_id, fund_value, month")
            .in("product_id", allIlpProductIds)
            .lt("month", nextMonthStr)
            .order("month", { ascending: false })
        : Promise.resolve({ data: [] as Array<{ product_id: string; fund_value: number; month: string }>, error: null }),
    ])

  // Fetch tax entries (actual_amount)
  const { data: taxEntriesData } = await supabase
    .from("tax_entries")
    .select("profile_id, year, actual_amount")
    .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"])
    .eq("year", year)

  const taxEntryByProfileYear = new Map<string, TaxEntryData>()
  for (const te of taxEntriesData ?? []) {
    taxEntryByProfileYear.set(`${te.profile_id}:${te.year}`, {
      actual_amount: te.actual_amount,
    })
  }

  // Build lookup maps
  const cashflowByKey = new Map<string, CashflowRow>()
  for (const row of cashflowRes.data ?? []) {
    const key = `${row.profile_id}:${normalizeMonthKey(row.month as string)}`
    const decoded = decodeMonthlyCashflowPii(row)
    cashflowByKey.set(key, {
      inflow: decoded.inflow,
      outflow: decoded.outflow,
    })
  }

  const profileById = new Map<string, ProfileData>()
  for (const p of profilesRes.data ?? []) {
    profileById.set(p.id, { birth_year: p.birth_year, name: p.name, self_help_group: p.self_help_group })
  }

  const incomeByProfileId = new Map<string, IncomeData>()
  for (const ic of incomeRes.data ?? []) {
    const decoded = decodeIncomeConfigPii(ic)
    incomeByProfileId.set(ic.profile_id, {
      annual_salary: decoded.annual_salary ?? 0,
      bonus_estimate: decoded.bonus_estimate ?? null,
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
  const insuranceByProfile = new Map<
    string,
    Array<InsurancePolicy & { name: string }>
  >()
  for (const pol of insuranceRes.data ?? []) {
    const pid = pol.profile_id as string
    if (pol.end_date && pol.end_date < nowDate) continue
    const list = insuranceByProfile.get(pid) ?? []
    const decoded = decodeInsurancePoliciesPii(pol)
    list.push({
      name: (pol.name as string) ?? "Policy",
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
    Array<{ name: string; monthly_premium: number; premium_payment_mode?: string | null }>
  >()
  for (const row of ilpRes.data ?? []) {
    const pid = row.profile_id as string
    const list = ilpByProfile.get(pid) ?? []
    list.push({
      name: (row.name as string) ?? "ILP Product",
      monthly_premium: row.monthly_premium,
      premium_payment_mode: row.premium_payment_mode,
    })
    ilpByProfile.set(pid, list)
  }

  const loansByProfile = new Map<
    string,
    Array<{ name: string; principal: number; rate_pct: number; tenure_months: number; use_cpf_oa?: boolean; start_date?: string | null }>
  >()
  for (const row of loansRes.data ?? []) {
    const pid = row.profile_id as string
    const list = loansByProfile.get(pid) ?? []
    list.push({
      name: (row.name as string) ?? "Loan",
      principal: decodeLoanPii(row).principal ?? 0,
      rate_pct: row.rate_pct,
      tenure_months: row.tenure_months,
      use_cpf_oa: !!row.use_cpf_oa,
      start_date: row.start_date,
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
  for (const g of savingsGoalsRes.data ?? []) {
    const pid = g.profile_id as string
    const amt = (g.monthly_auto_amount as number) ?? 0
    savingsGoalsByProfile.set(pid, (savingsGoalsByProfile.get(pid) ?? 0) + amt)
  }

  // Build lookup maps for new data
  const loanProfileMap = new Map<string, string>()
  const loanNameMap = new Map<string, string>()
  for (const loan of loansRes.data ?? []) {
    const lid = (loan as { id: string }).id
    loanProfileMap.set(lid, loan.profile_id as string)
    loanNameMap.set(lid, (loan.name as string) ?? "Loan")
  }

  const earlyRepaymentsByProfile = new Map<
    string,
    Array<{ amount: number; penalty_amount: number | null; date: string }>
  >()
  for (const er of earlyRepaymentsRes.data ?? []) {
    const pid = loanProfileMap.get(er.loan_id)
    if (!pid) continue
    const list = earlyRepaymentsByProfile.get(pid) ?? []
    list.push({ amount: er.amount, penalty_amount: er.penalty_amount, date: er.date })
    earlyRepaymentsByProfile.set(pid, list)
  }

  const goalProfileMap = new Map<string, string>()
  const goalNameMap = new Map<string, string>()
  for (const g of savingsGoalsRes.data ?? []) {
    const gid = (g as { id: string }).id
    goalProfileMap.set(gid, g.profile_id as string)
    goalNameMap.set(gid, (g.name as string) ?? "Goal")
  }

  const goalContribsByProfile = new Map<
    string,
    Array<{ amount: number; created_at: string }>
  >()
  for (const gc of goalContributionsRes.data ?? []) {
    const pid = goalProfileMap.get(gc.goal_id)
    if (!pid) continue
    const list = goalContribsByProfile.get(pid) ?? []
    list.push({ amount: gc.amount, created_at: gc.created_at })
    goalContribsByProfile.set(pid, list)
  }

  const oneTimeIlpByProfile = new Map<
    string,
    Array<{ name: string; monthly_premium: number; created_at: string }>
  >()
  for (const ilpRow of oneTimeIlpRes.data ?? []) {
    const pid = ilpRow.profile_id as string
    const list = oneTimeIlpByProfile.get(pid) ?? []
    list.push({ name: (ilpRow.name as string) ?? "ILP Product", monthly_premium: ilpRow.monthly_premium, created_at: ilpRow.created_at })
    oneTimeIlpByProfile.set(pid, list)
  }

  const investmentTxnsByProfile = new Map<
    string,
    Array<{ symbol: string; type: string; quantity: number; price: number; commission?: number; account_id?: string | null; created_at: string }>
  >()
  for (const txn of investmentTxnsRes.data ?? []) {
    const pid = txn.profile_id as string
    if (!pid) continue
    const list = investmentTxnsByProfile.get(pid) ?? []
    list.push({
      symbol: (txn.symbol as string) ?? "Unknown",
      type: txn.type,
      quantity: txn.quantity,
      price: txn.price,
      commission: txn.commission ?? 0,
      account_id: txn.account_id ?? null,
      created_at: txn.created_at,
    })
    investmentTxnsByProfile.set(pid, list)
  }

  // Build account name map for waterfall sub-item labels
  const accountNameMap = new Map<string, string>()
  {
    const { data: accRows } = await supabase
      .from("investment_accounts")
      .select("id, account_name")
      .eq("family_id", familyId)
    if (accRows) {
      for (const a of accRows) accountNameMap.set(a.id, a.account_name)
    }
  }

  // Aggregate per profile
  let inflowTotal = 0
  const inflowBreakdown: Record<string, number | undefined> = {}
  let discretionary = 0
  let giroTransfers = 0
  let insurance = 0
  let ilp = 0
  let ilpOneTime = 0
  let loans = 0
  let earlyRepayments = 0
  let tax = 0
  let taxReliefCash = 0
  let savingsGoals = 0
  let investments = 0

  // Sub-breakdown collectors
  type SubItem = { label: string; amount: number }
  const insuranceSub: SubItem[] = []
  const ilpSub: SubItem[] = []
  const ilpOneTimeSub: SubItem[] = []
  const loansSub: SubItem[] = []
  const earlyRepaymentsSub: SubItem[] = []
  const savingsGoalsSub: SubItem[] = []
  const investmentsByAccountAndSymbol = new Map<string, Map<string, number>>()
  const taxReliefCashSub: SubItem[] = []

  // Compute bank interest (batched in-memory)
  let bankInterest = 0
  for (const acct of bankAccountsForInterestRes.data ?? []) {
    const rate = acct.interest_rate_pct ?? 0
    const balance = acct.opening_balance ?? 0
    if (rate > 0 && balance > 0) {
      bankInterest += (balance * rate) / 100 / 12
    }
  }
  if (bankInterest > 0) {
    inflowBreakdown.bankInterest = bankInterest
    inflowTotal += bankInterest
  }

  // Compute dividends
  let dividends = 0
  for (const txn of dividendTxnsRes.data ?? []) {
    dividends += txn.quantity * txn.price
  }
  if (dividends > 0) {
    inflowBreakdown.dividends = dividends
    inflowTotal += dividends
  }

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
          year,
          (profile.self_help_group as SelfHelpGroup) ?? "none",
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

    // Outflow — discretionary WITHOUT giro (giro tracked separately)
    const cfKey = `${pid}:${monthStr}`
    const userOutflow = cashflowByKey.has(cfKey)
      ? (cashflowByKey.get(cfKey)!.outflow ?? 0)
      : 0
    discretionary += userOutflow
    giroTransfers += giroByProfile.get(pid) ?? 0

    // Insurance + legacy ILP (with sub-breakdown)
    const pols = insuranceByProfile.get(pid) ?? []
    const insSplit = sumInsuranceOutflowPremiumsSplit(pols)
    insurance += insSplit.insurance
    ilp += insSplit.ilpFromLegacyPolicies
    for (const p of pols) {
      if (!p.is_active || !p.deduct_from_outflow) continue
      const monthlyEq =
        p.frequency === "monthly" ? p.premium_amount : p.premium_amount / 12
      if (monthlyEq > 0) {
        if (p.type === "ilp") {
          ilpSub.push({ label: p.name, amount: monthlyEq })
        } else {
          insuranceSub.push({ label: p.name, amount: monthlyEq })
        }
      }
    }

    // ILP products (with sub-breakdown)
    const profileIlps = ilpByProfile.get(pid) ?? []
    ilp += sumIlpPremiums(profileIlps)
    for (const p of profileIlps) {
      if (p.premium_payment_mode === "one_time") continue
      if (p.monthly_premium > 0) {
        ilpSub.push({ label: p.name, amount: p.monthly_premium })
      }
    }

    // Loans (with sub-breakdown)
    const profileLoansData = loansByProfile.get(pid) ?? []
    loans += sumLoanMonthlyPayments(profileLoansData, monthStr)
    for (const loan of profileLoansData) {
      if (loan.use_cpf_oa) continue
      if (loan.start_date && loan.start_date > monthStr) continue
      const monthlyRate = loan.rate_pct / 100 / 12
      let payment = 0
      if (monthlyRate > 0 && loan.tenure_months > 0) {
        payment = (loan.principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -loan.tenure_months))
      } else if (loan.tenure_months > 0) {
        payment = loan.principal / loan.tenure_months
      }
      if (payment > 0) loansSub.push({ label: loan.name, amount: payment })
    }

    // Savings goals (with sub-breakdown)
    savingsGoals += savingsGoalsByProfile.get(pid) ?? 0
    for (const g of savingsGoalsRes.data ?? []) {
      if ((g.profile_id as string) !== pid) continue
      const amt = (g.monthly_auto_amount as number) ?? 0
      if (amt > 0) {
        savingsGoalsSub.push({ label: (g.name as string) ?? "Goal", amount: amt })
      }
    }
    savingsGoals += sumGoalContributionsForMonth(
      goalContribsByProfile.get(pid) ?? [],
      monthStr,
    )
    for (const gc of goalContribsByProfile.get(pid) ?? []) {
      const gcMonth = gc.created_at.slice(0, 7)
      if (gcMonth === monthStr.slice(0, 7) && gc.amount > 0) {
        const gid = [...goalProfileMap.entries()].find(([, v]) => v === pid)?.[0]
        const gName = gid ? (goalNameMap.get(gid) ?? "Goal") : "Goal"
        savingsGoalsSub.push({ label: `${gName} (extra)`, amount: gc.amount })
      }
    }

    // Early repayments (with sub-breakdown)
    earlyRepayments += sumEarlyRepaymentsForMonth(
      earlyRepaymentsByProfile.get(pid) ?? [],
      monthStr,
    )
    for (const er of earlyRepaymentsRes.data ?? []) {
      const erPid = loanProfileMap.get(er.loan_id)
      if (erPid !== pid) continue
      const erMonth = er.date.slice(0, 7)
      if (erMonth !== monthStr.slice(0, 7)) continue
      const total = er.amount + (er.penalty_amount ?? 0)
      if (total > 0) {
        earlyRepaymentsSub.push({ label: loanNameMap.get(er.loan_id) ?? "Loan", amount: total })
      }
    }

    // ILP one-time (with sub-breakdown)
    ilpOneTime += sumOneTimeIlpForMonth(
      oneTimeIlpByProfile.get(pid) ?? [],
      monthStr,
    )
    for (const p of oneTimeIlpByProfile.get(pid) ?? []) {
      const pMonth = p.created_at.slice(0, 7)
      if (pMonth === monthStr.slice(0, 7) && p.monthly_premium > 0) {
        ilpOneTimeSub.push({ label: p.name, amount: p.monthly_premium })
      }
    }

    // Tax relief cash (with sub-breakdown)
    taxReliefCash += sumTaxReliefCashForMonth(
      (taxReliefRes.data ?? [])
        .filter((tr) => tr.profile_id === pid)
        .map((tr) => ({ relief_type: tr.relief_type, amount: tr.amount, year: tr.year as number })),
      year,
    )
    const CASH_RELIEF_LABELS: Record<string, string> = {
      srs: "SRS",
      cpf_topup_self: "CPF Top-up (Self)",
      cpf_topup_family: "CPF Top-up (Family)",
    }
    for (const tr of (taxReliefRes.data ?? []).filter((r) => r.profile_id === pid)) {
      if (tr.year !== year) continue
      const label = CASH_RELIEF_LABELS[tr.relief_type]
      if (label && tr.amount > 0) {
        taxReliefCashSub.push({ label, amount: tr.amount / 12 })
      }
    }

    // Investments — raw net deployment (can be negative when selling > buying)
    investments += rawNetDeploymentForMonth(
      investmentTxnsByProfile.get(pid) ?? [],
      monthStr,
    )
    for (const txn of investmentTxnsByProfile.get(pid) ?? []) {
      const txnMonth = txn.created_at.slice(0, 7)
      if (txnMonth !== monthStr.slice(0, 7)) continue
      const fee = txn.commission ?? 0
      const accKey = txn.account_id ?? "unknown"
      if (!investmentsByAccountAndSymbol.has(accKey)) {
        investmentsByAccountAndSymbol.set(accKey, new Map())
      }
      const symbolMap = investmentsByAccountAndSymbol.get(accKey)!
      const current = symbolMap.get(txn.symbol) ?? 0
      if (txn.type === "buy") {
        symbolMap.set(txn.symbol, current + txn.quantity * txn.price + fee)
      } else if (txn.type === "sell") {
        symbolMap.set(txn.symbol, current - (txn.quantity * txn.price - fee))
      }
    }

    tax += monthlyTaxForProfile(
      pid,
      year,
      profileById,
      incomeByProfileId,
      pols,
      taxReliefByProfileYear.get(`${pid}:${year}`) ?? [],
      taxEntryByProfileYear,
    )
  }

  // Shared ILP (with sub-breakdown)
  ilp += sumIlpPremiums(sharedIlpRes.data)
  for (const p of sharedIlpRes.data ?? []) {
    if (p.premium_payment_mode === "one_time") continue
    if (p.monthly_premium > 0) {
      ilpSub.push({ label: (p.name as string) ?? "Shared ILP", amount: p.monthly_premium })
    }
  }

  const outflowTotal =
    discretionary +
    giroTransfers +
    insurance +
    ilp +
    ilpOneTime +
    loans +
    earlyRepayments +
    tax +
    taxReliefCash +
    savingsGoals +
    investments
  const netSavings = inflowTotal - outflowTotal

  // Bank balance: compute ending, derive starting from net savings
  const singleProfileId = profileIds.length === 1 ? profileIds[0] ?? null : null
  const endingBankBalance = await computeBankTotal(
    supabase,
    familyId,
    singleProfileId,
    monthStr,
  )
  const startingBankBalance = endingBankBalance - netSavings

  const round = (n: number) => Math.round(n * 100) / 100

  // ── Investment section ──
  let investmentSection: InvestmentWaterfallSection | undefined
  const invStartSnapshot = invSnapshotStartRes.data?.[0]
  const invEndSnapshot = invSnapshotEndRes.data?.[0]
  if (invStartSnapshot || invEndSnapshot) {
    const invStartVal = invStartSnapshot?.total_value ?? 0
    const invEndVal = invEndSnapshot?.total_value ?? 0

    // Raw net deployment (buys - sells, not floored) to isolate actual market movement
    let netDeployment = 0
    for (const pid of profileIds) {
      netDeployment += rawNetDeploymentForMonth(
        investmentTxnsByProfile.get(pid) ?? [],
        monthStr,
      )
    }

    // ILP premiums paid from bank this month
    const totalIlpPremiums = ilp + ilpOneTime

    // ILP fund totals at start and end of month (latest per product)
    const sumLatestPerProduct = (rows: Array<{ product_id: string; fund_value: number }> | null): number => {
      if (!rows?.length) return 0
      const latest = new Map<string, number>()
      for (const r of rows) {
        if (!latest.has(r.product_id)) latest.set(r.product_id, r.fund_value)
      }
      return Array.from(latest.values()).reduce((s, v) => s + v, 0)
    }
    const ilpStartTotal = sumLatestPerProduct(ilpEntriesStartRes.data)
    const ilpEndTotal = sumLatestPerProduct(ilpEntriesEndRes.data)

    // Total market gain (including ILP)
    const invMarketGain = invEndVal - invStartVal - dividends - netDeployment - totalIlpPremiums

    // Split: ILP performance vs securities gain/loss
    const ilpPerformance = ilpEndTotal - ilpStartTotal - totalIlpPremiums
    const securitiesGainLoss = invMarketGain - ilpPerformance

    // Per-account+symbol investment sub-breakdown (for Cash Deployed tooltip)
    const investmentSub: SubItem[] = []
    const hasMultipleAccounts = investmentsByAccountAndSymbol.size > 1
    for (const [accId, symbolMap] of investmentsByAccountAndSymbol) {
      const accName = accountNameMap.get(accId) ?? (accId === "unknown" ? "" : "")
      for (const [symbol, net] of symbolMap) {
        if (net === 0) continue
        const label = hasMultipleAccounts && accName ? `${accName}: ${symbol}` : symbol
        investmentSub.push({ label, amount: round(Math.abs(net)) })
      }
    }
    investmentSub.sort((a, b) => b.amount - a.amount)

    investmentSection = {
      startingValue: round(invStartVal),
      endingValue: round(invEndVal),
      dividends: round(dividends),
      marketGain: round(invMarketGain),
      netDeployment: round(netDeployment),
      ilpPremiums: round(totalIlpPremiums),
      securitiesGainLoss: round(securitiesGainLoss),
      ilpPerformance: round(ilpPerformance),
      deploymentSubItems: investmentSub.length > 0 ? investmentSub : undefined,
      ilpSubItems: [...ilpSub, ...ilpOneTimeSub].length > 0
        ? [...ilpSub, ...ilpOneTimeSub]
        : undefined,
    }
  }

  // ── CPF section ──
  let cpfSection: CpfWaterfallSection | undefined
  const cpfRows = cpfBalancesRes.data ?? []
  if (cpfRows.length > 0 || profileIds.length > 0) {
    // Aggregate CPF balances by month
    let cpfStartOa = 0, cpfStartSa = 0, cpfStartMa = 0
    let cpfEndOa = 0, cpfEndSa = 0, cpfEndMa = 0
    let hasEndBalance = false

    for (const row of cpfRows) {
      const m = typeof row.month === "string" ? row.month.slice(0, 10) : ""
      const decoded = decodeCpfBalancesPii(row)
      const oa = Number(decoded.oa) || 0
      const sa = Number(decoded.sa) || 0
      const ma = Number(decoded.ma) || 0
      if (m === prevMonthStr) {
        cpfStartOa += oa; cpfStartSa += sa; cpfStartMa += ma
      } else if (m === monthStr) {
        cpfEndOa += oa; cpfEndSa += sa; cpfEndMa += ma
        hasEndBalance = true
      }
    }

    // Compute monthly contributions from income
    let totalContributions = 0
    for (const pid of profileIds) {
      const profile = profileById.get(pid)
      const incomeConfig = incomeByProfileId.get(pid)
      if (!profile || !incomeConfig || incomeConfig.annual_salary <= 0) continue
      const age = getAge(profile.birth_year, year)
      const monthlyGross = incomeConfig.annual_salary / 12
      const contrib = calculateCpfContribution(monthlyGross, age, year)
      totalContributions += contrib.total
    }

    // CPF OA housing deductions (use_cpf_oa loans)
    let cpfHousing = 0
    for (const pid of profileIds) {
      const profileLoans = loansByProfile.get(pid) ?? []
      for (const loan of profileLoans) {
        if (!loan.use_cpf_oa) continue
        if (loan.start_date && loan.start_date > monthStr) continue
        const monthlyRate = loan.rate_pct / 100 / 12
        let payment = 0
        if (monthlyRate > 0 && loan.tenure_months > 0) {
          payment = (loan.principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -loan.tenure_months))
        } else if (loan.tenure_months > 0) {
          payment = loan.principal / loan.tenure_months
        }
        cpfHousing += payment
      }
    }

    const cpfStart = cpfStartOa + cpfStartSa + cpfStartMa
    const cpfEnd = hasEndBalance
      ? cpfEndOa + cpfEndSa + cpfEndMa
      : cpfStart + totalContributions - cpfHousing

    if (cpfStart > 0 || cpfEnd > 0 || totalContributions > 0) {
      cpfSection = {
        startingBalance: round(cpfStart),
        endingBalance: round(cpfEnd),
        contributions: round(totalContributions),
        housing: round(cpfHousing),
      }
    }
  }

  const roundedInflowBreakdown =
    Object.keys(inflowBreakdown).length > 0
      ? Object.fromEntries(
          Object.entries(inflowBreakdown).map(([k, v]) => [k, round(v ?? 0)])
        )
      : undefined

  // Build sub-breakdowns (only include categories with 2+ items)
  const subBreakdowns: Record<string, Array<{ label: string; amount: number }>> = {}
  const roundSub = (items: SubItem[]) =>
    items.filter((i) => i.amount > 0).map((i) => ({ label: i.label, amount: round(i.amount) }))

  if (insuranceSub.length >= 2) subBreakdowns["Insurance"] = roundSub(insuranceSub)
  if (ilpSub.length >= 2) subBreakdowns["ILP"] = roundSub(ilpSub)
  if (ilpOneTimeSub.length >= 2) subBreakdowns["ILP (One-Time)"] = roundSub(ilpOneTimeSub)
  if (loansSub.length >= 2) subBreakdowns["Loans"] = roundSub(loansSub)
  if (earlyRepaymentsSub.length >= 2) subBreakdowns["Early Repayments"] = roundSub(earlyRepaymentsSub)
  if (savingsGoalsSub.length >= 2) subBreakdowns["Savings Goals"] = roundSub(savingsGoalsSub)
  if (taxReliefCashSub.length >= 2) subBreakdowns["SRS/CPF Top-ups"] = roundSub(taxReliefCashSub)

  // Investment sub-breakdown by account+symbol (for bank section "Investments" bar)
  const bankInvestmentSub: SubItem[] = []
  const bankHasMultipleAccounts = investmentsByAccountAndSymbol.size > 1
  for (const [accId, symbolMap] of investmentsByAccountAndSymbol) {
    const accName = accountNameMap.get(accId) ?? ""
    for (const [symbol, net] of symbolMap) {
      if (net <= 0) continue
      const label = bankHasMultipleAccounts && accName ? `${accName}: ${symbol}` : symbol
      bankInvestmentSub.push({ label, amount: round(net) })
    }
  }
  bankInvestmentSub.sort((a, b) => b.amount - a.amount)
  if (bankInvestmentSub.length >= 2) subBreakdowns["Investments"] = bankInvestmentSub

  return {
    month,
    startingBankBalance: round(startingBankBalance),
    endingBankBalance: round(endingBankBalance),
    inflowTotal: round(inflowTotal),
    inflowBreakdown: roundedInflowBreakdown,
    outflowTotal: round(outflowTotal),
    outflowBreakdown: {
      discretionary: round(discretionary),
      insurance: round(insurance),
      ilp: round(ilp),
      ilpOneTime: round(ilpOneTime),
      loans: round(loans),
      earlyRepayments: round(earlyRepayments),
      tax: round(tax),
      taxReliefCash: round(taxReliefCash),
      savingsGoals: round(savingsGoals),
      investments: round(investments),
      giroTransfers: round(giroTransfers),
    },
    netSavings: round(netSavings),
    investments: investmentSection,
    cpf: cpfSection,
    ...(Object.keys(subBreakdowns).length > 0 ? { subBreakdowns } : {}),
  }
}
