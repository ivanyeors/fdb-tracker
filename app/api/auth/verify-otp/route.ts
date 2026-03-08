import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { createSession, COOKIE_NAME } from "@/lib/auth/session"

const verifyOtpSchema = z.object({
  householdId: z.string().uuid(),
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

    const { householdId, otp } = parsed.data
    const otpHash = await sha256(otp)
    const supabase = createSupabaseAdmin()

    const { data: token, error: tokenError } = await supabase
      .from("otp_tokens")
      .select("id")
      .eq("household_id", householdId)
      .eq("otp_hash", otpHash)
      .eq("used", false)
      .gte("expires_at", new Date().toISOString())
      .single()

    if (tokenError || !token) {
      return NextResponse.json(
        { error: "Invalid or expired OTP" },
        { status: 401 },
      )
    }

    await supabase
      .from("otp_tokens")
      .update({ used: true })
      .eq("id", token.id)

    const sessionToken = await createSession(householdId)
    const isProduction = process.env.NODE_ENV === "production"

    const response = NextResponse.json({ success: true })
    response.cookies.set(COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    })

    return response
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
