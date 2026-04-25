import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSessionFromCookies } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { decryptBotToken } from "@/lib/telegram/credentials"

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const householdId = await getSessionFromCookies(cookieStore)

    if (!householdId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    let botToken: string | undefined
    let chatId: string | undefined

    try {
      const body = await request.json().catch(() => ({}))
      if (body.telegramBotToken?.trim() && body.telegramChatId?.trim()) {
        botToken = body.telegramBotToken.trim()
        chatId = body.telegramChatId.trim()
      }
    } catch {
      /* use saved values */
    }

    if (!botToken || !chatId) {
      const supabase = createSupabaseAdmin()
      const { data: household, error } = await supabase
        .from("households")
        .select("telegram_bot_token, telegram_bot_token_enc, telegram_chat_id")
        .eq("id", householdId)
        .single()

      if (error || !household) {
        return NextResponse.json(
          { success: false, error: "Could not load household settings" },
          { status: 500 },
        )
      }

      botToken = decryptBotToken(household)?.trim()
      chatId = household.telegram_chat_id?.trim()
    }

    if (!botToken || !chatId) {
      return NextResponse.json(
        {
          success: false,
          error: "Bot token and Chat ID are required. Enter them above and save, or test with saved values.",
        },
        { status: 400 },
      )
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "✅ fdb-tracker notifications are working! You'll receive reminders here.",
      }),
    })

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { description?: string }
      const description = data.description ?? `HTTP ${res.status}`
      return NextResponse.json(
        { success: false, error: description },
        { status: 400 },
      )
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to send test message" },
      { status: 500 },
    )
  }
}
