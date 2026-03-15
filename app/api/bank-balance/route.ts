import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { buildBalanceTimeline } from "@/lib/calculations/bank-balance"
import { getEffectiveInflowForProfile } from "@/lib/api/effective-inflow"
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

    const cashflowMap: Record<string, { inflow: number; outflow: number }> = {}

    if (profileId) {
      const { data: cashflow } = await supabase
        .from("monthly_cashflow")
        .select("month, inflow, outflow")
        .eq("profile_id", profileId)
        .gte("month", startMonth)
        .lte("month", endMonth)

      if (cashflow) {
        for (const row of cashflow) {
          cashflowMap[row.month] = { inflow: row.inflow, outflow: row.outflow }
        }
      }
    }

    // User's outflow is total (inclusive of insurance, ILP, loans, tax)
    // Add GIRO debit from this account and credit to this account
    const [giroDebit, giroCredit] = await Promise.all([
      getGiroDebitForAccount(supabase, bankAccountId),
      getGiroCreditForAccount(supabase, bankAccountId),
    ])

    const monthlyData = await Promise.all(
      monthRange.map(async (month) => {
        const cf = cashflowMap[month] ?? { inflow: 0, outflow: 0 }
        const resolvedInflow = profileId
          ? await getEffectiveInflowForProfile(supabase, profileId, month)
          : cf.inflow
        return {
          month,
          inflow: resolvedInflow + giroCredit,
          discretionaryOutflow: cf.outflow + giroDebit,
          insurancePremiums: 0,
          ilpPremiums: 0,
          loanRepayments: 0,
          taxProvision: 0,
        }
      }),
    )

    const timeline = buildBalanceTimeline({
      openingBalance: account.opening_balance,
      monthlyData,
    })

    return NextResponse.json(timeline)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
