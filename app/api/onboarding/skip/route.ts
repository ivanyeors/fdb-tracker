import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, createSession, COOKIE_NAME } from "@/lib/auth/session"
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
      console.error("Onboarding skip error:", error)
      return NextResponse.json(
        { error: "Failed to skip onboarding" },
        { status: 500 },
      )
    }

    const newToken = await createSession(session.accountId, {
      onboardingComplete: true,
      isSuperAdmin: session.isSuperAdmin,
    })
    const isProduction = process.env.NODE_ENV === "production"
    const response = NextResponse.json({ success: true })
    response.cookies.set(COOKIE_NAME, newToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    })
    return response
  } catch (error) {
    console.error("Onboarding skip error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
