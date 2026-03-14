import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const { searchParams } = request.nextUrl
    const profileId = searchParams.get("profileId")

    const supabase = createSupabaseAdmin()

    let query = supabase
      .from("savings_goals")
      .select("*")
      .eq("household_id", accountId)
      .order("created_at", { ascending: true })

    if (profileId) {
      query = query.or(`profile_id.eq.${profileId},profile_id.is.null`)
    }

    const { data: goals, error } = await query

    if (error) {
      return NextResponse.json({ error: "Failed to fetch goals" }, { status: 500 })
    }

    return NextResponse.json(goals || [])
  } catch (err) {
    console.error("[api/goals] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
