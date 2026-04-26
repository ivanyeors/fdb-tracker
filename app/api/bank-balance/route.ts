import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { decodeMonthlyCashflowPii } from "@/lib/repos/monthly-cashflow"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { buildBalanceTimeline } from "@/lib/calculations/bank-balance"
import { getEffectiveInflowForProfile } from "@/lib/api/effective-inflow"
import { getEffectiveOutflowForProfile } from "@/lib/api/effective-outflow"
import {
  getGiroDebitForAccount,
  getGiroCreditForAccount,
} from "@/lib/api/giro-amounts"

const balanceQuerySchema = z.object({
  accountId: z.string().uuid(),
  months: z.string().regex(/^\d+$/).optional(),
})

function generateMonthRange(count: number): string[] {
  const months: string[] = []
  const now = new Date()

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    months.push(`${yyyy}-${mm}-01`)
  }

  return months
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const { searchParams } = request.nextUrl
    const parsed = balanceQuerySchema.safeParse({
      accountId: searchParams.get("accountId"),
      months: searchParams.get("months") ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const bankAccountId = parsed.data.accountId
    const monthCount = parsed.data.months ? parseInt(parsed.data.months, 10) : 12
    const supabase = createSupabaseAdmin()

    const { data: account } = await supabase
      .from("bank_accounts")
      .select("*")
      .eq("id", bankAccountId)
      .single()

    if (!account) {
      return NextResponse.json({ error: "Bank account not found" }, { status: 404 })
    }

    const { data: family } = await supabase
      .from("families")
      .select("household_id")
      .eq("id", account.family_id)
      .eq("household_id", accountId)
      .single()

    if (!family) {
      return NextResponse.json({ error: "Bank account not found" }, { status: 404 })
    }

    const monthRange = generateMonthRange(monthCount)
    const startMonth = monthRange[0]!
    const endMonth = monthRange[monthRange.length - 1]!

    const profileId = account.profile_id

    // For shared accounts (no profile_id), resolve all profiles in the family
    let profileIds: string[] = profileId ? [profileId] : []
    if (!profileId) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .eq("family_id", account.family_id)
      profileIds = profiles?.map((p) => p.id) ?? []
    }

    const cashflowMap: Record<string, { inflow: number; outflow: number }> = {}

    if (profileId) {
      const { data: cashflow } = await supabase
        .from("monthly_cashflow")
        .select("month, inflow_enc, outflow_enc")
        .eq("profile_id", profileId)
        .gte("month", startMonth)
        .lte("month", endMonth)

      if (cashflow) {
        for (const row of cashflow) {
          const decoded = decodeMonthlyCashflowPii(row)
          cashflowMap[row.month] = {
            inflow: decoded.inflow ?? 0,
            outflow: decoded.outflow ?? 0,
          }
        }
      }
    }

    // Add GIRO debit from this account and credit to this account
    const [giroDebit, giroCredit] = await Promise.all([
      getGiroDebitForAccount(supabase, bankAccountId),
      getGiroCreditForAccount(supabase, bankAccountId),
    ])

    // Fetch inflow and outflow for all profile+month combos in parallel
    // instead of sequential per-profile loops inside each month
    const profileMonthPairs = profileIds.flatMap((pid) =>
      monthRange.map((month) => ({ pid, month })),
    )

    const [inflowResults, outflowResults] = await Promise.all([
      Promise.all(
        profileMonthPairs.map(({ pid, month }) =>
          getEffectiveInflowForProfile(supabase, pid, month),
        ),
      ),
      Promise.all(
        profileMonthPairs.map(({ pid, month }) =>
          getEffectiveOutflowForProfile(supabase, pid, month),
        ),
      ),
    ])

    // Build lookup maps: "profileId:month" -> value
    const inflowMap = new Map<string, number>()
    const outflowMap = new Map<string, Awaited<ReturnType<typeof getEffectiveOutflowForProfile>>>()
    profileMonthPairs.forEach(({ pid, month }, i) => {
      const key = `${pid}:${month}`
      inflowMap.set(key, inflowResults[i]!)
      outflowMap.set(key, outflowResults[i]!)
    })

    const monthlyData = monthRange.map((month) => {
      const cf = cashflowMap[month] ?? { inflow: 0, outflow: 0 }

      let resolvedInflow = 0
      let insurancePremiums = 0
      let ilpPremiums = 0
      let loanRepayments = 0
      let taxProvision = 0
      let savingsGoals = 0

      for (const pid of profileIds) {
        const key = `${pid}:${month}`
        resolvedInflow += inflowMap.get(key) ?? 0
        const eff = outflowMap.get(key)
        if (eff) {
          insurancePremiums += eff.insurance
          ilpPremiums += eff.ilp
          loanRepayments += eff.loans
          taxProvision += eff.tax
          savingsGoals += eff.savingsGoals
        }
      }

      // If no profiles resolved (edge case), fall back to raw cashflow
      if (profileIds.length === 0) {
        resolvedInflow = cf.inflow
      }

      return {
        month,
        inflow: resolvedInflow + giroCredit,
        discretionaryOutflow: cf.outflow + giroDebit + savingsGoals,
        insurancePremiums,
        ilpPremiums,
        loanRepayments,
        taxProvision,
      }
    })

    // Use most recent reconciliation snapshot as baseline, or fall back to opening_balance
    let openingBalance: number
    const { data: reconciliation } = await supabase
      .from("bank_balance_snapshots")
      .select("month, closing_balance")
      .eq("account_id", bankAccountId)
      .eq("is_reconciliation", true)
      .order("month", { ascending: false })
      .limit(1)

    if (reconciliation?.[0]) {
      openingBalance = reconciliation[0].closing_balance
      // Only use months after the reconciliation point
      const reconMonth = reconciliation[0].month
      const firstAfterRecon = monthlyData.findIndex((d) => d.month > reconMonth)
      if (firstAfterRecon > 0) {
        monthlyData.splice(0, firstAfterRecon)
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      openingBalance = account.opening_balance - ((account as any).locked_amount ?? 0)
    }

    const timeline = buildBalanceTimeline({
      openingBalance,
      monthlyData,
    })

    return NextResponse.json(timeline)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
