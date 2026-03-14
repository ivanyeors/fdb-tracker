import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { calculateSavingsRate } from "@/lib/calculations/bank-balance"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { getEffectiveOutflowForProfile } from "@/lib/api/effective-outflow"

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
    const profileId = profileIds[0] ?? null

    // --- Bank Total ---
    let bankAccountQuery = supabase
      .from("bank_accounts")
      .select("id")
      .eq("family_id", familyId)

    if (profileId) {
      bankAccountQuery = bankAccountQuery.eq("profile_id", profileId)
    }

    const { data: bankAccounts } = await bankAccountQuery
    const accountIds = bankAccounts?.map((a) => a.id) ?? []

    let bankTotal = 0

    if (accountIds.length > 0) {
      const { data: snapshots } = await supabase
        .from("bank_balance_snapshots")
        .select("account_id, month, closing_balance")
        .in("account_id", accountIds)
        .order("month", { ascending: false })

      if (snapshots) {
        const latestByAccount = new Map<string, number>()
        for (const s of snapshots) {
          if (!latestByAccount.has(s.account_id)) {
            latestByAccount.set(s.account_id, s.closing_balance)
          }
        }
        for (const balance of latestByAccount.values()) {
          bankTotal += balance
        }
      }
    }

    // --- CPF Total ---
    let cpfTotal = 0

    if (profileId) {
      const { data: cpfLatest } = await supabase
        .from("cpf_balances")
        .select("oa, sa, ma")
        .eq("profile_id", profileId)
        .order("month", { ascending: false })
        .limit(1)
        .single()

      if (cpfLatest) {
        cpfTotal = cpfLatest.oa + cpfLatest.sa + cpfLatest.ma
      }
    } else {
      if (profileIds.length > 0) {
        for (const pid of profileIds) {
          const { data: cpfLatest } = await supabase
            .from("cpf_balances")
            .select("oa, sa, ma")
            .eq("profile_id", pid)
            .order("month", { ascending: false })
            .limit(1)
            .single()

          if (cpfLatest) {
            cpfTotal += cpfLatest.oa + cpfLatest.sa + cpfLatest.ma
          }
        }
      }
    }

    // --- Investment Total ---
    let investmentQuery = supabase
      .from("investments")
      .select("units, cost_basis")
      .eq("family_id", familyId)

    if (profileId) {
      investmentQuery = investmentQuery.eq("profile_id", profileId)
    }

    const { data: investments } = await investmentQuery
    let investmentTotal = 0

    if (investments) {
      for (const inv of investments) {
        investmentTotal += inv.units * inv.cost_basis
      }
    }

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
      const latestMonth = cashflowRows[0]!.month
      const rowsForLatest = cashflowRows.filter((r) => r.month === latestMonth)
      let totalInflow = 0
      let totalEffectiveOutflow = 0

      for (const row of rowsForLatest) {
        totalInflow += row.inflow ?? 0
        const eff = await getEffectiveOutflowForProfile(
          supabase,
          row.profile_id,
          latestMonth
        )
        totalEffectiveOutflow += eff.total
      }

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
    })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
