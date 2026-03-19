import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { computeInvestmentTotal } from "@/lib/api/investment-total"

const historyQuerySchema = z.object({
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
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

    const { familyId: fid } = resolved
    const pid = profileId ?? null

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const startStr = startDate.toISOString().slice(0, 10)
    const endStr = endDate.toISOString().slice(0, 10)

    let snapshotsQuery = supabase
      .from("investment_snapshots")
      .select("date, total_value")
      .eq("family_id", fid)
      .gte("date", startStr)
      .lte("date", endStr)
      .order("date", { ascending: true })

    if (pid) {
      snapshotsQuery = snapshotsQuery.eq("profile_id", pid)
    } else {
      snapshotsQuery = snapshotsQuery.is("profile_id", null)
    }

    const { data: snapshots } = await snapshotsQuery

    const todayStr = endDate.toISOString().slice(0, 10)
    const hasTodaySnapshot = snapshots?.some((s) => s.date === todayStr)

    let data: { date: string; value: number }[] =
      snapshots?.map((s) => ({
        date: s.date,
        value: Math.round(s.total_value * 100) / 100,
      })) ?? []

    if (!hasTodaySnapshot) {
      const liveTotal = await computeInvestmentTotal(supabase, fid, pid, {
        ilpMonthFilter: null,
      })
      data.push({
        date: todayStr,
        value: Math.round(liveTotal * 100) / 100,
      })
      data.sort((a, b) => a.date.localeCompare(b.date))
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error("[api/investments/history] Error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
