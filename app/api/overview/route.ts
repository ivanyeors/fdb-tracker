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

const overviewQuerySchema = z.object({
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
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
    const parsed = overviewQuerySchema.safeParse({ profileId: rawProfileId, familyId: rawFamilyId })

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
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

    // --- Bank Total ---
    let bankAccountQuery = supabase
      .from("bank_accounts")
      .select("id, opening_balance, locked_amount")
      .eq("family_id", familyId)

    if (profileId) {
      bankAccountQuery = bankAccountQuery.or(
        `profile_id.eq.${profileId},profile_id.is.null`,
      )
    }

    const { data: bankAccounts } = await bankAccountQuery
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accounts = (bankAccounts as any[]) ?? []
    const accountIds = accounts.map((a) => a.id)
    const openingByAccount = new Map(
      accounts.map((a) => [a.id, a.opening_balance ?? 0]),
    )
    const lockedByAccount = new Map(
      accounts.map((a) => [a.id, a.locked_amount ?? 0]),
    )

    let bankTotal = 0

    if (accountIds.length > 0) {
      const { data: snapshots } = await supabase
        .from("bank_balance_snapshots")
        .select("account_id, month, closing_balance")
        .in("account_id", accountIds)
        .order("month", { ascending: false })

      const latestByAccount = new Map<string, number>()
      if (snapshots) {
        for (const s of snapshots) {
          if (!latestByAccount.has(s.account_id)) {
            latestByAccount.set(s.account_id, s.closing_balance)
          }
        }
      }
      for (const accId of accountIds) {
        const bal = latestByAccount.get(accId) ?? openingByAccount.get(accId) ?? 0
        const locked = lockedByAccount.get(accId) ?? 0
        bankTotal += Math.max(0, bal - locked)
      }
    }

    // --- CPF Total ---
    let cpfTotal = 0

    const targetProfileIds = profileId ? [profileId] : profileIds
    for (const pid of targetProfileIds) {
      const { data: cpfLatest } = await supabase
        .from("cpf_balances")
        .select("oa, sa, ma")
        .eq("profile_id", pid)
        .order("month", { ascending: false })
        .limit(1)
        .single()

      if (cpfLatest) {
        cpfTotal += cpfLatest.oa + cpfLatest.sa + cpfLatest.ma
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
          const currentYear = new Date().getFullYear()
          const age = getAge(profile.birth_year, currentYear)
          const monthlyGross = incomeConfig.annual_salary / 12
          const contribution = calculateCpfContribution(
            monthlyGross,
            age,
            currentYear,
          )
          const monthsElapsed = new Date().getMonth() + 1
          cpfTotal +=
            contribution.oa * monthsElapsed +
            contribution.sa * monthsElapsed +
            contribution.ma * monthsElapsed
        }
      }
    }

    // --- Investment Total (holdings + cash balance) ---
    let investmentQuery = supabase
      .from("investments")
      .select("units, cost_basis")
      .eq("family_id", familyId)

    if (profileId) {
      investmentQuery = investmentQuery.eq("profile_id", profileId)
    }

    const { data: investments } = await investmentQuery
    let holdingsTotal = 0

    if (investments) {
      for (const inv of investments) {
        holdingsTotal += inv.units * inv.cost_basis
      }
    }

    let cashTotal = 0
    if (profileId) {
      const { data: accountRow } = await supabase
        .from("investment_accounts")
        .select("cash_balance")
        .eq("family_id", familyId)
        .eq("profile_id", profileId)
        .maybeSingle()
      cashTotal = accountRow?.cash_balance ?? 0
    } else {
      const { data: accounts } = await supabase
        .from("investment_accounts")
        .select("cash_balance")
        .eq("family_id", familyId)
      cashTotal = accounts?.reduce((s, a) => s + (a.cash_balance ?? 0), 0) ?? 0
    }

    const investmentTotal = holdingsTotal + cashTotal

    // --- Loan Total --- (profileIds already resolved above)

    let loanTotal = 0

    if (profileIds.length > 0) {
      const { data: loans } = await supabase
        .from("loans")
        .select("id, principal")
        .in("profile_id", profileIds)

      if (loans && loans.length > 0) {
        const loanIds = loans.map((l) => l.id)
        let totalPrincipal = 0
        for (const loan of loans) {
          totalPrincipal += loan.principal
        }

        let totalRepayments = 0
        const { data: repayments } = await supabase
          .from("loan_repayments")
          .select("amount")
          .in("loan_id", loanIds)

        if (repayments) {
          for (const r of repayments) {
            totalRepayments += r.amount
          }
        }

        let totalEarlyRepayments = 0
        const { data: earlyRepayments } = await supabase
          .from("loan_early_repayments")
          .select("amount")
          .in("loan_id", loanIds)

        if (earlyRepayments) {
          for (const r of earlyRepayments) {
            totalEarlyRepayments += r.amount
          }
        }

        loanTotal = totalPrincipal - totalRepayments - totalEarlyRepayments
      }
    }

    // --- Savings Rate (using effective outflow: discretionary + insurance + ilp + loans + tax) ---
    let savingsRate = 0
    let latestInflow = 0
    let latestOutflow = 0
    let latestMonth: string | null = null

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

      // Add shared ILP products (profile_id null) once
      const sharedIlp = await getSharedIlpTotalForFamily(supabase, familyId)
      totalEffectiveOutflow += sharedIlp

      latestInflow = totalInflow
      latestOutflow = totalEffectiveOutflow
      savingsRate = calculateSavingsRate(totalInflow, totalEffectiveOutflow)
    }

    // --- Compute net worth ---
    const liquidNetWorth = bankTotal + investmentTotal - loanTotal
    const totalNetWorth = liquidNetWorth + cpfTotal

    return NextResponse.json({
      bankTotal: Math.round(bankTotal * 100) / 100,
      cpfTotal: Math.round(cpfTotal * 100) / 100,
      investmentTotal: Math.round(investmentTotal * 100) / 100,
      loanTotal: Math.round(loanTotal * 100) / 100,
      liquidNetWorth: Math.round(liquidNetWorth * 100) / 100,
      totalNetWorth: Math.round(totalNetWorth * 100) / 100,
      savingsRate: Math.round(savingsRate * 100) / 100,
      latestInflow: Math.round(latestInflow * 100) / 100,
      latestOutflow: Math.round(latestOutflow * 100) / 100,
      latestMonth,
    })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
