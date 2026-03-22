import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { getEffectiveInflowForProfile } from "@/lib/api/effective-inflow"
import { getEffectiveOutflowForProfile } from "@/lib/api/effective-outflow"

const querySchema = z.object({
  profileId: z.string().uuid(),
})

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = request.nextUrl
    const parsed = querySchema.safeParse({
      profileId: searchParams.get("profileId") ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: "profileId required" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      session.accountId,
      parsed.data.profileId,
      null
    )
    if (!resolved) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`

    const [inflow, outflowResult] = await Promise.all([
      getEffectiveInflowForProfile(supabase, parsed.data.profileId, currentMonth),
      getEffectiveOutflowForProfile(supabase, parsed.data.profileId, currentMonth),
    ])

    return NextResponse.json({
      inflow: Math.round(inflow * 100) / 100,
      outflow: Math.round(outflowResult.total * 100) / 100,
      outflowBreakdown: {
        discretionary: outflowResult.discretionary,
        insurance: outflowResult.insurance,
        ilp: outflowResult.ilp,
        loans: outflowResult.loans,
        tax: outflowResult.tax,
      },
    })
  } catch (err) {
    console.error("[api/cashflow/effective] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
