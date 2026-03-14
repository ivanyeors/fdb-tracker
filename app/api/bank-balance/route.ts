import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { buildBalanceTimeline } from "@/lib/calculations/bank-balance"

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
      .eq("household_id", accountId)
      .single()

    if (!account) {
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

    let insuranceMonthly = 0
    let ilpMonthly = 0
    let loanMonthly = 0

    if (profileId) {
      const { data: policies } = await supabase
        .from("insurance_policies")
        .select("premium_amount, frequency, is_active, deduct_from_outflow")
        .eq("profile_id", profileId)
        .eq("is_active", true)
        .eq("deduct_from_outflow", true)

      if (policies) {
        for (const p of policies) {
          insuranceMonthly += p.frequency === "monthly"
            ? p.premium_amount
            : p.premium_amount / 12
        }
      }

      const { data: ilps } = await supabase
        .from("ilp_products")
        .select("monthly_premium")
        .eq("profile_id", profileId)

      if (ilps) {
        for (const ilp of ilps) {
          ilpMonthly += ilp.monthly_premium
        }
      }

      const { data: loans } = await supabase
        .from("loans")
        .select("id, principal, rate_pct, tenure_months")
        .eq("profile_id", profileId)

      if (loans) {
        for (const loan of loans) {
          const monthlyRate = loan.rate_pct / 100 / 12
          if (monthlyRate > 0 && loan.tenure_months > 0) {
            const payment =
              (loan.principal * monthlyRate) /
              (1 - Math.pow(1 + monthlyRate, -loan.tenure_months))
            loanMonthly += payment
          } else if (loan.tenure_months > 0) {
            loanMonthly += loan.principal / loan.tenure_months
          }
        }
      }
    }

    const monthlyData = monthRange.map((month) => {
      const cf = cashflowMap[month] ?? { inflow: 0, outflow: 0 }
      return {
        month,
        inflow: cf.inflow,
        discretionaryOutflow: cf.outflow,
        insurancePremiums: insuranceMonthly,
        ilpPremiums: ilpMonthly,
        loanRepayments: loanMonthly,
      }
    })

    const timeline = buildBalanceTimeline({
      openingBalance: account.opening_balance,
      monthlyData,
    })

    return NextResponse.json(timeline)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
