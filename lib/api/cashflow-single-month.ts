/**
 * Batched single-month cashflow with inflow/outflow breakdown.
 * Replaces the N+1 per-profile loop in the cashflow waterfall mode.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { calculateTakeHome } from "@/lib/calculations/take-home"
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
  GIRO_OUTFLOW_DESTINATIONS,
  type CashflowRow,
  type IncomeData,
  type InsurancePolicy,
  type ProfileData,
  type TaxEntryData,
} from "@/lib/api/cashflow-aggregation"

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
      .select("id, profile_id, principal, rate_pct, tenure_months, use_cpf_oa")
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
      .select("id, profile_id, monthly_auto_amount")
      .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"]),
  ])

  // Additional fetches that depend on first batch results
  const allLoanIds = (loansRes.data ?? []).map((l) => (l as { id: string }).id)
  const allGoalIds = (savingsGoalsRes.data ?? []).map((g) => (g as { id: string }).id)
  const monthDate = new Date(monthStr)
  const nextMonthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)
  const nextMonthStr = nextMonthDate.toISOString().slice(0, 10)

  const prevMonthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1)
  const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}-01`

  const [earlyRepaymentsRes, goalContributionsRes, oneTimeIlpRes, investmentTxnsRes, bankAccountsForInterestRes, dividendTxnsRes, invSnapshotStartRes, invSnapshotEndRes, cpfBalancesRes] =
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
        .select("profile_id, monthly_premium, created_at")
        .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"])
        .eq("premium_payment_mode", "one_time"),
      supabase
        .from("investment_transactions")
        .select("profile_id, type, quantity, price, created_at")
        .eq("family_id", familyId)
        .in("type", ["buy", "sell"])
        .gte("created_at", monthStr)
        .lt("created_at", nextMonthStr),
      // Bank accounts for interest estimation
      supabase
        .from("bank_accounts")
        .select("profile_id, opening_balance, interest_rate_pct")
        .eq("family_id", familyId),
      // Dividend transactions for the month
      supabase
        .from("investment_transactions")
        .select("profile_id, quantity, price")
        .eq("family_id", familyId)
        .eq("type", "dividend")
        .gte("created_at", monthStr)
        .lt("created_at", nextMonthStr),
      // Investment snapshot: last entry before month start
      supabase
        .from("investment_snapshots")
        .select("total_value")
        .eq("family_id", familyId)
        .lt("date", monthStr)
        .order("date", { ascending: false })
        .limit(1),
      // Investment snapshot: last entry before month end
      supabase
        .from("investment_snapshots")
        .select("total_value")
        .eq("family_id", familyId)
        .lt("date", nextMonthStr)
        .order("date", { ascending: false })
        .limit(1),
      // CPF balances for prev month and target month
      supabase
        .from("cpf_balances")
        .select("profile_id, month, oa, sa, ma")
        .in("profile_id", profileIds.length > 0 ? profileIds : ["__none__"])
        .in("month", [prevMonthStr, monthStr]),
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

  // Build lookup maps for new data
  const loanProfileMap = new Map<string, string>()
  for (const loan of loansRes.data ?? []) {
    loanProfileMap.set((loan as { id: string }).id, loan.profile_id as string)
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
  for (const g of savingsGoalsRes.data ?? []) {
    goalProfileMap.set((g as { id: string }).id, g.profile_id as string)
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
    Array<{ monthly_premium: number; created_at: string }>
  >()
  for (const ilpRow of oneTimeIlpRes.data ?? []) {
    const pid = ilpRow.profile_id as string
    const list = oneTimeIlpByProfile.get(pid) ?? []
    list.push({ monthly_premium: ilpRow.monthly_premium, created_at: ilpRow.created_at })
    oneTimeIlpByProfile.set(pid, list)
  }

  const investmentTxnsByProfile = new Map<
    string,
    Array<{ type: string; quantity: number; price: number; created_at: string }>
  >()
  for (const txn of investmentTxnsRes.data ?? []) {
    const pid = txn.profile_id as string
    if (!pid) continue
    const list = investmentTxnsByProfile.get(pid) ?? []
    list.push({
      type: txn.type,
      quantity: txn.quantity,
      price: txn.price,
      created_at: txn.created_at,
    })
    investmentTxnsByProfile.set(pid, list)
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

    // Outflow — discretionary WITHOUT giro (giro tracked separately)
    const cfKey = `${pid}:${monthStr}`
    const userOutflow = cashflowByKey.has(cfKey)
      ? (cashflowByKey.get(cfKey)!.outflow ?? 0)
      : 0
    discretionary += userOutflow
    giroTransfers += giroByProfile.get(pid) ?? 0

    const pols = insuranceByProfile.get(pid) ?? []
    const insSplit = sumInsuranceOutflowPremiumsSplit(pols)
    insurance += insSplit.insurance
    ilp += insSplit.ilpFromLegacyPolicies

    ilp += sumIlpPremiums(ilpByProfile.get(pid) ?? [])
    loans += sumLoanMonthlyPayments(loansByProfile.get(pid) ?? [])
    savingsGoals += savingsGoalsByProfile.get(pid) ?? 0
    savingsGoals += sumGoalContributionsForMonth(
      goalContribsByProfile.get(pid) ?? [],
      monthStr,
    )

    earlyRepayments += sumEarlyRepaymentsForMonth(
      earlyRepaymentsByProfile.get(pid) ?? [],
      monthStr,
    )

    ilpOneTime += sumOneTimeIlpForMonth(
      oneTimeIlpByProfile.get(pid) ?? [],
      monthStr,
    )

    taxReliefCash += sumTaxReliefCashForMonth(
      (taxReliefRes.data ?? [])
        .filter((tr) => tr.profile_id === pid)
        .map((tr) => ({ relief_type: tr.relief_type, amount: tr.amount, year: tr.year as number })),
      year,
    )

    investments += sumNetInvestmentPurchasesForMonth(
      investmentTxnsByProfile.get(pid) ?? [],
      monthStr,
    )

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

  // Shared ILP
  ilp += sumIlpPremiums(sharedIlpRes.data)

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

    // Sum buys, sells, dividends from already-fetched transaction data
    let totalBuys = 0
    let totalSells = 0
    for (const txn of investmentTxnsRes.data ?? []) {
      const amt = txn.quantity * txn.price
      if (txn.type === "buy") totalBuys += amt
      else if (txn.type === "sell") totalSells += amt
    }

    const invMarketGain = invEndVal - invStartVal - dividends - totalSells + totalBuys

    investmentSection = {
      startingValue: round(invStartVal),
      endingValue: round(invEndVal),
      dividends: round(dividends),
      buys: round(totalBuys),
      sells: round(totalSells),
      marketGain: round(invMarketGain),
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
      const oa = Number(row.oa) || 0
      const sa = Number(row.sa) || 0
      const ma = Number(row.ma) || 0
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
  }
}
