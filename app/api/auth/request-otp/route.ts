import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const requestOtpSchema = z.object({
  householdId: z.string().uuid(),
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
    const parsed = requestOtpSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid household ID format" },
        { status: 400 },
      )
    }

    const { householdId } = parsed.data
    const supabase = createSupabaseAdmin()

    const { data: household, error: householdError } = await supabase
      .from("households")
      .select("id, telegram_bot_token, telegram_chat_id")
      .eq("id", householdId)
      .single()

    if (householdError || !household) {
      return NextResponse.json(
        { error: "Household not found" },
        { status: 404 },
      )
    }

    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()

    const { count } = await supabase
      .from("otp_tokens")
      .select("*", { count: "exact", head: true })
      .eq("household_id", householdId)
      .gte("created_at", fifteenMinAgo)

    if (count !== null && count >= 3) {
      return NextResponse.json(
        { error: "Too many OTP requests. Please wait before trying again." },
        { status: 429 },
      )
    }

    const otp = Math.floor(100_000 + Math.random() * 900_000).toString()
    const otpHash = await sha256(otp)

    const { error: insertError } = await supabase
      .from("otp_tokens")
      .insert({
        household_id: householdId,
        otp_hash: otpHash,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to create OTP" },
        { status: 500 },
      )
    }

    if (household.telegram_bot_token && household.telegram_chat_id) {
      await fetch(
        `https://api.telegram.org/bot${household.telegram_bot_token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: household.telegram_chat_id,
            text: `🔑 Your OTP: ${otp}`,
          }),
        },
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
