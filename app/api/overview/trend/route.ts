import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const trendQuerySchema = z.object({
  profileId: z.string().uuid().optional(),
  months: z.coerce.number().int().min(1).max(24).optional(),
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
    const parsed = trendQuerySchema.safeParse({
      profileId: searchParams.get("profileId") ?? undefined,
      months: searchParams.get("months") ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const { profileId, months = 12 } = parsed.data
    const supabase = createSupabaseAdmin()

    const monthKeys: string[] = []
    const now = new Date()
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, "0")
      monthKeys.push(`${yyyy}-${mm}-01`)
    }

    let bankAccountQuery = supabase
      .from("bank_accounts")
      .select("id, opening_balance")
      .eq("household_id", accountId)

    if (profileId) {
      bankAccountQuery = bankAccountQuery.or(
        `profile_id.eq.${profileId},profile_id.is.null`,
      )
    }

    const { data: bankAccounts } = await bankAccountQuery
    const accountIds = bankAccounts?.map((a) => a.id) ?? []
    const openingByAccount = new Map(
      bankAccounts?.map((a) => [a.id, a.opening_balance]) ?? [],
    )

    let profileIds: string[] = []
    if (profileId) {
      profileIds = [profileId]
    } else {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .eq("household_id", accountId)
      profileIds = profiles?.map((p) => p.id) ?? []
    }

    const allSnapshots =
      accountIds.length > 0
        ? (
            await supabase
              .from("bank_balance_snapshots")
              .select("account_id, month, closing_balance")
              .in("account_id", accountIds)
              .lte("month", monthKeys[monthKeys.length - 1] ?? "")
          ).data ?? []
        : []

    const { data: allCpfRows } =
      profileIds.length > 0
        ? await supabase
            .from("cpf_balances")
            .select("profile_id, month, oa, sa, ma")
            .in("profile_id", profileIds)
            .lte("month", monthKeys[monthKeys.length - 1] ?? "")
        : { data: [] }

    let investmentQuery = supabase
      .from("investments")
      .select("units, cost_basis")
      .eq("household_id", accountId)
    if (profileId) {
      investmentQuery = investmentQuery.eq("profile_id", profileId)
    }
    const { data: investments } = await investmentQuery
    const investmentTotal =
      investments?.reduce((s, inv) => s + inv.units * inv.cost_basis, 0) ?? 0

    let loanTotal = 0
    if (profileIds.length > 0) {
      const { data: loans } = await supabase
        .from("loans")
        .select("id, principal")
        .in("profile_id", profileIds)

      if (loans && loans.length > 0) {
        const loanIds = loans.map((l) => l.id)
        const totalPrincipal = loans.reduce((s, l) => s + l.principal, 0)
        const { data: repayments } = await supabase
          .from("loan_repayments")
          .select("amount")
          .in("loan_id", loanIds)
        const { data: earlyRepayments } = await supabase
          .from("loan_early_repayments")
          .select("amount")
          .in("loan_id", loanIds)
        const totalRepayments =
          repayments?.reduce((s, r) => s + r.amount, 0) ?? 0
        const totalEarly =
          earlyRepayments?.reduce((s, r) => s + r.amount, 0) ?? 0
        loanTotal = totalPrincipal - totalRepayments - totalEarly
      }
    }

    const result: { month: string; value: number }[] = []

    for (const monthKey of monthKeys) {
      let bankTotal = 0
      if (accountIds.length > 0) {
        const monthStr = monthKey.slice(0, 7)
        const relevantSnapshots = allSnapshots.filter(
          (s) => String(s.month).slice(0, 7) <= monthStr,
        )
        const latestByAccount = new Map<string, number>()
        for (const s of relevantSnapshots.sort(
          (a, b) =>
            new Date(b.month).getTime() - new Date(a.month).getTime(),
        )) {
          if (!latestByAccount.has(s.account_id)) {
            latestByAccount.set(s.account_id, s.closing_balance)
          }
        }
        for (const accId of accountIds) {
          bankTotal +=
            latestByAccount.get(accId) ?? openingByAccount.get(accId) ?? 0
        }
      }

      let cpfTotal = 0
      if (allCpfRows && allCpfRows.length > 0) {
        const monthStr = monthKey.slice(0, 7)
        for (const pid of profileIds) {
          const profileRows = allCpfRows
            .filter(
              (r) =>
                r.profile_id === pid &&
                String(r.month).slice(0, 7) <= monthStr,
            )
            .sort(
              (a, b) =>
                new Date(b.month).getTime() - new Date(a.month).getTime(),
            )
          const latest = profileRows[0]
          if (latest) {
            cpfTotal += latest.oa + latest.sa + latest.ma
          }
        }
      }

      const liquidNetWorth = bankTotal + investmentTotal - loanTotal
      const totalNetWorth = liquidNetWorth + cpfTotal

      result.push({
        month: monthKey.slice(0, 7),
        value: Math.round(totalNetWorth * 100) / 100,
      })
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error("Overview trend error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
