import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { createSession, COOKIE_NAME } from "@/lib/auth/session"

const verifyOtpSchema = z.object({
  otp: z.string().length(6),
})

async function sha256(message: string): Promise<string> {
  const data = new TextEncoder().encode(message)
  const hash = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = verifyOtpSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const { otp } = parsed.data
    const otpHash = await sha256(otp)
    const supabase = createSupabaseAdmin()

    const { data: otpToken, error: tokenError } = await supabase
      .from("otp_tokens")
      .select("id, household_id")
      .eq("otp_hash", otpHash)
      .eq("used", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (tokenError || !otpToken) {
      return NextResponse.json(
        { error: "Invalid or expired OTP" },
        { status: 401 }
      )
    }

    await supabase
      .from("otp_tokens")
      .update({ used: true })
      .eq("id", otpToken.id)

    // Check onboarding status + first family in parallel
    const [{ data: household }, { data: firstFamily }] = await Promise.all([
      supabase
        .from("households")
        .select("onboarding_completed_at")
        .eq("id", otpToken.household_id)
        .single(),
      supabase
        .from("families")
        .select("id")
        .eq("household_id", otpToken.household_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ])

    const onboardingComplete = !!household?.onboarding_completed_at
    const sessionToken = await createSession(otpToken.household_id, {
      onboardingComplete,
    })
    const isProduction = process.env.NODE_ENV === "production"

    const response = NextResponse.json({ success: true })
    response.cookies.set(COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    })

    if (firstFamily?.id) {
      response.cookies.set("fdb-active-family-id", firstFamily.id, {
        httpOnly: false,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      })
    }

    return response
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
