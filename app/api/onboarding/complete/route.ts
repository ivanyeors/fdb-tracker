import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

export async function POST() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = createSupabaseAdmin()
    const { error } = await supabase
      .from("households")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", session.accountId)

    if (error) {
      return NextResponse.json(
        { error: "Failed to complete onboarding" },
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
