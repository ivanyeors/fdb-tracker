import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { fetchInvestmentHistory } from "@/lib/api/investment-history-data"

const historyQuerySchema = z.object({
  profileId: z.uuid().optional(),
  familyId: z.uuid().optional(),
  days: z.coerce.number().int().min(1).max(90).optional(),
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
    const parsed = historyQuerySchema.safeParse({
      profileId: searchParams.get("profileId") ?? undefined,
      familyId: searchParams.get("familyId") ?? undefined,
      days: searchParams.get("days") ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const { profileId, familyId, days = 30 } = parsed.data
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

    const result = await fetchInvestmentHistory(supabase, {
      familyId: resolved.familyId,
      profileId: profileId ?? null,
      days,
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error("[api/investments/history] Error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
