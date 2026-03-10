import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/server"

async function sha256(message: string): Promise<string> {
  const data = new TextEncoder().encode(message)
  const hash = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

async function getOrCreateHouseholdForChannel(
  chatId: string,
): Promise<string | null> {
  const supabase = createSupabaseAdmin()
  const { data: existing } = await supabase
    .from("households")
    .select("id")
    .eq("telegram_chat_id", chatId)
    .maybeSingle()
  if (existing?.id) return existing.id

  const { data: created, error } = await supabase
    .from("households")
    .insert({ user_count: 1, telegram_chat_id: chatId })
    .select("id")
    .single()
  if (error || !created) return null
  return created.id
}

export async function POST() {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID
    if (!botToken || !chatId) {
      return NextResponse.json(
        { error: "Telegram bot or channel not configured" },
        { status: 500 },
      )
    }

    const householdId = await getOrCreateHouseholdForChannel(chatId)
    if (!householdId) {
      return NextResponse.json(
        { error: "Failed to create or find household for OTP channel" },
        { status: 500 },
      )
    }

    const supabase = createSupabaseAdmin()
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

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `🔑 Your OTP: ${otp}`,
      }),
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
