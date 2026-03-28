import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { calculateSavingsRate } from "@/lib/calculations/bank-balance"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import {
  getEffectiveOutflowForProfile,
  getSharedIlpTotalForFamily,
} from "@/lib/api/effective-outflow"
import { getEffectiveInflowForProfile } from "@/lib/api/effective-inflow"
import { getAge, calculateCpfContribution } from "@/lib/calculations/cpf"
import { computeTotalInvestmentsValue } from "@/lib/api/net-liquid"
import { estimateOutstandingPrincipal, loanMonthlyPayment } from "@/lib/calculations/loans"
import { computeBankTotal } from "@/lib/calculations/computed-bank-balance"

const overviewQuerySchema = z.object({
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const { searchParams } = request.nextUrl
    const rawProfileId = searchParams.get("profileId") ?? undefined
    const rawFamilyId = searchParams.get("familyId") ?? undefined
    const rawMonth = searchParams.get("month") ?? undefined
    const parsed = overviewQuerySchema.safeParse({
      profileId: rawProfileId,
      familyId: rawFamilyId,
      month: rawMonth,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const monthFilter = parsed.data.month ?? null

    function getPreviousMonth(monthStr: string): string {
      const [y, m] = monthStr.split("-").map(Number)
      const date = new Date(y, m - 2, 1)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`
    }

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      parsed.data.profileId ?? null,
      parsed.data.familyId ?? null
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }

    const { familyId, profileIds } = resolved
    const profileId = parsed.data.profileId ?? null

    // --- Bank Total (computed from cashflow) ---
    const bankTotal = await computeBankTotal(
      supabase,
      familyId,
      profileId,
      monthFilter ?? undefined,
    )

    // --- CPF Total ---
    const targetProfileIds = profileId ? [profileId] : profileIds

    async function getCpfForMonth(month: string | null): Promise<{
      total: number
      oa: number
      sa: number
      ma: number
    }> {
      let total = 0
      let oa = 0
      let sa = 0
      let ma = 0
      for (const pid of targetProfileIds) {
        let cpfQuery = supabase
          .from("cpf_balances")
          .select("oa, sa, ma")
          .eq("profile_id", pid)
          .order("month", { ascending: false })
          .limit(1)
        if (month) {
          cpfQuery = cpfQuery.lte("month", month)
        }
        const { data: cpfLatest } = await cpfQuery.single()

        if (cpfLatest) {
          const o = cpfLatest.oa ?? 0
          const s = cpfLatest.sa ?? 0
          const m = cpfLatest.ma ?? 0
          oa += o
          sa += s
          ma += m
          total += o + s + m
        } else {
          // Project from income when no manual override
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, birth_year")
            .eq("id", pid)
            .single()
          const { data: incomeConfig } = await supabase
            .from("income_config")
            .select("annual_salary, bonus_estimate")
            .eq("profile_id", pid)
            .single()

          if (profile && incomeConfig && incomeConfig.annual_salary > 0) {
            const refDate = month ? new Date(month) : new Date()
            const currentYear = refDate.getFullYear()
            const age = getAge(profile.birth_year, currentYear)
            const monthlyGross = incomeConfig.annual_salary / 12
            const contribution = calculateCpfContribution(
              monthlyGross,
              age,
              currentYear,
            )
            const monthsElapsed = refDate.getMonth() + 1
            const o = contribution.oa * monthsElapsed
            const s = contribution.sa * monthsElapsed
            const m = contribution.ma * monthsElapsed
            oa += o
            sa += s
            ma += m
            total += o + s + m
          }
        }
      }
      return { total, oa, sa, ma }
    }

    // Determine reference month for CPF (for trend comparison)
    let cpfReferenceMonth: string | null = monthFilter
    if (!cpfReferenceMonth && targetProfileIds.length > 0) {
      const { data: latestCpf } = await supabase
        .from("cpf_balances")
        .select("month")
        .in("profile_id", targetProfileIds)
        .order("month", { ascending: false })
        .limit(1)
        .maybeSingle()
      cpfReferenceMonth = latestCpf?.month ?? null
    }

    const cpfCurrent = await getCpfForMonth(cpfReferenceMonth)
    const cpfTotal = cpfCurrent.total
    const cpfOa = cpfCurrent.oa
    const cpfSa = cpfCurrent.sa
    const cpfMa = cpfCurrent.ma

    let cpfDelta: number | undefined
    if (cpfReferenceMonth) {
      const prevMonth = getPreviousMonth(cpfReferenceMonth)
      const cpfPrevious = await getCpfForMonth(prevMonth)
      cpfDelta = cpfTotal - cpfPrevious.total
    }

    // --- Investments: NLV (SGD cash + live quotes) + ILP fund values ---
    const { netLiquidValue, ilpFundTotal, investmentTotal } =
      await computeTotalInvestmentsValue(
        supabase,
        familyId,
        profileId,
        monthFilter,
      )

    // --- Loan Total --- (profileIds already resolved above)

    let loanTotal = 0
    let loanMonthlyTotal = 0
    let loanRemainingMonths = 0

    function getRemainingMonths(startDate: string, tenureMonths: number): number {
      const start = new Date(startDate)
      const end = new Date(start)
      end.setMonth(end.getMonth() + tenureMonths)
      const now = new Date()
      const diff =
        (end.getFullYear() - now.getFullYear()) * 12 +
        (end.getMonth() - now.getMonth())
      return Math.max(0, diff)
    }

    if (profileIds.length > 0) {
      const { data: loans } = await supabase
        .from("loans")
        .select("id, principal, rate_pct, tenure_months, start_date")
        .in("profile_id", profileIds)

      if (loans && loans.length > 0) {
        const loanIds = loans.map((l) => l.id)

        const [{ data: repayments }, { data: earlyRepayments }] =
          await Promise.all([
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

        for (const loan of loans) {
          loanMonthlyTotal += loanMonthlyPayment(
            loan.principal,
            loan.rate_pct,
            loan.tenure_months,
          )
          const remaining = getRemainingMonths(loan.start_date, loan.tenure_months)
          if (remaining > loanRemainingMonths) {
            loanRemainingMonths = remaining
          }

          const loanRepayments = (repayments ?? [])
            .filter((r) => r.loan_id === loan.id)
            .map((r) => ({ amount: r.amount, date: r.date }))
          const loanEarlyRepayments = (earlyRepayments ?? [])
            .filter((r) => r.loan_id === loan.id)
            .map((r) => ({ amount: r.amount, date: r.date }))

          loanTotal += estimateOutstandingPrincipal(
            loan.principal,
            loan.rate_pct,
            loanRepayments,
            loanEarlyRepayments,
          )
        }
      }
    }

    // --- Savings Rate (using effective outflow: discretionary + insurance + ilp + loans + tax) ---
    let savingsRate = 0
    let latestInflow = 0
    let latestOutflow = 0
    let latestMonth: string | null = null
    let previousMonthInflow: number | undefined
    let previousMonthOutflow: number | undefined
    let previousMonthSavings: number | undefined

    const targetMonth = monthFilter ?? null

    async function getCashflowForMonth(month: string) {
      const rowsQuery = profileId
        ? supabase
            .from("monthly_cashflow")
            .select("profile_id, month, inflow, outflow")
            .eq("profile_id", profileId)
            .eq("month", month)
        : supabase
            .from("monthly_cashflow")
            .select("profile_id, month, inflow, outflow")
            .in("profile_id", profileIds)
            .eq("month", month)
      const { data: rows } = await rowsQuery
      if (!rows || rows.length === 0) return { inflow: 0, outflow: 0 }
      let totalInflow = 0
      let totalEffectiveOutflow = 0
      for (const row of rows) {
        totalInflow += await getEffectiveInflowForProfile(
          supabase,
          row.profile_id,
          month,
        )
        const eff = await getEffectiveOutflowForProfile(
          supabase,
          row.profile_id,
          month,
        )
        totalEffectiveOutflow += eff.total
      }
      const sharedIlp = await getSharedIlpTotalForFamily(supabase, familyId)
      totalEffectiveOutflow += sharedIlp
      return { inflow: totalInflow, outflow: totalEffectiveOutflow }
    }

    if (targetMonth) {
      latestMonth = targetMonth
      const cf = await getCashflowForMonth(targetMonth)
      latestInflow = cf.inflow
      latestOutflow = cf.outflow
      savingsRate = calculateSavingsRate(cf.inflow, cf.outflow)
      const prevMonth = getPreviousMonth(targetMonth)
      const prevCf = await getCashflowForMonth(prevMonth)
      previousMonthInflow = prevCf.inflow
      previousMonthOutflow = prevCf.outflow
      previousMonthSavings = prevCf.inflow - prevCf.outflow
    } else {
      const cashflowQuery = profileId
        ? supabase
            .from("monthly_cashflow")
            .select("profile_id, month, inflow, outflow")
            .eq("profile_id", profileId)
            .order("month", { ascending: false })
            .limit(1)
        : supabase
            .from("monthly_cashflow")
            .select("profile_id, month, inflow, outflow")
            .in("profile_id", profileIds)
            .order("month", { ascending: false })
            .limit(profileIds.length * 2)

      const { data: cashflowRows } = await cashflowQuery

      if (cashflowRows && cashflowRows.length > 0) {
        latestMonth = cashflowRows[0]!.month
        const rowsForLatest = cashflowRows.filter((r) => r.month === latestMonth)
        let totalInflow = 0
        let totalEffectiveOutflow = 0

        for (const row of rowsForLatest) {
          totalInflow += await getEffectiveInflowForProfile(
            supabase,
            row.profile_id,
            latestMonth!,
          )
          const eff = await getEffectiveOutflowForProfile(
            supabase,
            row.profile_id,
            latestMonth!
          )
          totalEffectiveOutflow += eff.total
        }

        const sharedIlp = await getSharedIlpTotalForFamily(supabase, familyId)
        totalEffectiveOutflow += sharedIlp

        latestInflow = totalInflow
        latestOutflow = totalEffectiveOutflow
        savingsRate = calculateSavingsRate(totalInflow, totalEffectiveOutflow)
      }
    }

    // --- Compute net worth ---
    const liquidNetWorth = bankTotal + investmentTotal - loanTotal
    const totalNetWorth = liquidNetWorth + cpfTotal

    const response: Record<string, unknown> = {
      bankTotal: Math.round(bankTotal * 100) / 100,
      cpfTotal: Math.round(cpfTotal * 100) / 100,
      cpfBreakdown: {
        oa: Math.round(cpfOa * 100) / 100,
        sa: Math.round(cpfSa * 100) / 100,
        ma: Math.round(cpfMa * 100) / 100,
      },
      netLiquidValue: Math.round(netLiquidValue * 100) / 100,
      ilpFundTotal: Math.round(ilpFundTotal * 100) / 100,
      investmentTotal: Math.round(investmentTotal * 100) / 100,
      loanTotal: Math.round(loanTotal * 100) / 100,
      loanMonthlyTotal: Math.round(loanMonthlyTotal * 100) / 100,
      loanRemainingMonths,
      liquidNetWorth: Math.round(liquidNetWorth * 100) / 100,
      totalNetWorth: Math.round(totalNetWorth * 100) / 100,
      savingsRate: Math.round(savingsRate * 100) / 100,
      latestInflow: Math.round(latestInflow * 100) / 100,
      latestOutflow: Math.round(latestOutflow * 100) / 100,
      latestMonth,
    }
    if (previousMonthInflow !== undefined) {
      response.previousMonthInflow = Math.round(previousMonthInflow * 100) / 100
    }
    if (previousMonthOutflow !== undefined) {
      response.previousMonthOutflow = Math.round(previousMonthOutflow * 100) / 100
    }
    if (previousMonthSavings !== undefined) {
      response.previousMonthSavings = Math.round(previousMonthSavings * 100) / 100
    }
    if (cpfDelta !== undefined) {
      response.cpfDelta = Math.round(cpfDelta * 100) / 100
    }
    return NextResponse.json(response)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
