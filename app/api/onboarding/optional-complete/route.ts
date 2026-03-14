import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const profileId = body?.profileId
    if (!profileId || typeof profileId !== "string") {
      return NextResponse.json({ error: "profileId required" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, family_id")
      .eq("id", profileId)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const { data: family } = await supabase
      .from("families")
      .select("household_id")
      .eq("id", profile.family_id)
      .eq("household_id", session.accountId)
      .single()

    if (!family) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ optional_onboarding_completed_at: new Date().toISOString() })
      .eq("id", profileId)

    if (updateError) {
      console.error("Optional complete update error:", updateError)
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
