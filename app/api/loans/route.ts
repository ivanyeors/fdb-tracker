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

    const { searchParams } = request.nextUrl
    const profileId = searchParams.get("profileId")

    const supabase = createSupabaseAdmin()

    if (!profileId) {
      return NextResponse.json({ error: "Missing profileId" }, { status: 400 })
    }

    // Verify profile belongs to household
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", profileId)
      .eq("household_id", session.accountId)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found or unauthorized" }, { status: 403 })
    }

    const { data: loans, error } = await supabase
      .from("loans")
      .select("*")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: true })

    if (error) {
      return NextResponse.json({ error: "Failed to fetch loans" }, { status: 500 })
    }

    return NextResponse.json(loans || [])
  } catch (err) {
    console.error("[api/loans] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
