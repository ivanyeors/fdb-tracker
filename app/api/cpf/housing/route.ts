import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import {
  aggregateHousingUsage,
  detailTrancheAccrual,
  vlHeadroom120,
} from "@/lib/calculations/cpf-housing"

const housingQuerySchema = z.object({
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
})

const USAGE_TYPES = ["downpayment", "monthly", "stamp_duty", "legal", "hps", "other"] as const

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const { searchParams } = request.nextUrl
    const parsed = housingQuerySchema.safeParse({
      profileId: searchParams.get("profileId") ?? undefined,
      familyId: searchParams.get("familyId") ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const { profileId, familyId } = parsed.data
    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      profileId ?? null,
      familyId ?? null,
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }
    const { profileIds } = resolved

    const asOf = new Date()

    const { data: cpfLoans } = await supabase
      .from("loans")
      .select("id, name, type, use_cpf_oa, valuation_limit")
      .in("profile_id", profileIds)
      .eq("use_cpf_oa", true)

    if (!cpfLoans || cpfLoans.length === 0) {
      return NextResponse.json({
        asOf: asOf.toISOString().slice(0, 10),
        oaUsed: 0,
        accruedInterest: 0,
        refundDue: 0,
        vlRemaining: null,
        loans: [],
      })
    }

    const loanIds = cpfLoans.map((l) => l.id)

    const { data: usageRows } = await supabase
      .from("cpf_housing_usage")
      .select("id, loan_id, principal_withdrawn, withdrawal_date, usage_type")
      .in("loan_id", loanIds)

    const byLoan = new Map<string, typeof usageRows>()
    for (const row of usageRows ?? []) {
      const lid = row.loan_id
      const list = byLoan.get(lid) ?? []
      list.push(row)
      byLoan.set(lid, list)
    }

    let totalPrincipal = 0
    let totalAccrued = 0
    let vlHeadroomSum = 0
    let anyVl = false

    const loansOut = cpfLoans.map((loan) => {
      const rows = byLoan.get(loan.id) ?? []
      const tranches = rows.map((r) => ({
        id: r.id,
        principalWithdrawn: Number(r.principal_withdrawn),
        withdrawalDate: r.withdrawal_date,
        usageType:
          r.usage_type != null && USAGE_TYPES.includes(r.usage_type as (typeof USAGE_TYPES)[number])
            ? (r.usage_type as (typeof USAGE_TYPES)[number])
            : null,
      }))
      const agg = aggregateHousingUsage(
        tranches.map((t) => ({
          id: t.id,
          principalWithdrawn: t.principalWithdrawn,
          withdrawalDate: t.withdrawalDate,
        })),
        asOf,
      )
      totalPrincipal += agg.totalPrincipal
      totalAccrued += agg.totalAccruedInterest

      const vl = loan.valuation_limit != null ? Number(loan.valuation_limit) : null
      let headroom: number | null = null
      if (vl != null && vl > 0) {
        anyVl = true
        headroom = vlHeadroom120(vl, agg.totalPrincipal) ?? 0
        vlHeadroomSum += headroom
      }

      return {
        loanId: loan.id,
        name: loan.name,
        type: loan.type,
        valuationLimit: vl,
        ...agg,
        vlHeadroom120: headroom,
        tranches: tranches.map((t) => ({
          ...t,
          ...detailTrancheAccrual(
            {
              principalWithdrawn: t.principalWithdrawn,
              withdrawalDate: t.withdrawalDate,
            },
            asOf,
          ),
        })),
      }
    })

    return NextResponse.json({
      asOf: asOf.toISOString().slice(0, 10),
      oaUsed: Math.round(totalPrincipal * 100) / 100,
      accruedInterest: Math.round(totalAccrued * 100) / 100,
      refundDue: Math.round((totalPrincipal + totalAccrued) * 100) / 100,
      vlRemaining: anyVl ? Math.round(vlHeadroomSum * 100) / 100 : null,
      loans: loansOut,
    })
  } catch (err) {
    console.error("[api/cpf/housing] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
