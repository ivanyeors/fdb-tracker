import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"

const housingQuerySchema = z.object({
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
      familyId ?? null
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }
    const { profileIds } = resolved

    const { data: cpfLoans } = await supabase
      .from("loans")
      .select("id")
      .in("profile_id", profileIds)
      .eq("use_cpf_oa", true)

    if (!cpfLoans || cpfLoans.length === 0) {
      return NextResponse.json({
        oaUsed: 0,
        accruedInterest: 0,
        refundDue: 0,
        vlRemaining: 0,
      })
    }

    const loanIds = cpfLoans.map((l) => l.id)

    const { data: usageRows } = await supabase
      .from("cpf_housing_usage")
      .select("principal_withdrawn, accrued_interest")
      .in("loan_id", loanIds)

    let oaUsed = 0
    let accruedInterest = 0

    for (const row of usageRows ?? []) {
      oaUsed += Number(row.principal_withdrawn)
      accruedInterest += Number(row.accrued_interest)
    }

    const refundDue = oaUsed + accruedInterest

    return NextResponse.json({
      oaUsed: Math.round(oaUsed * 100) / 100,
      accruedInterest: Math.round(accruedInterest * 100) / 100,
      refundDue: Math.round(refundDue * 100) / 100,
      vlRemaining: 0,
    })
  } catch (err) {
    console.error("[api/cpf/housing] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
