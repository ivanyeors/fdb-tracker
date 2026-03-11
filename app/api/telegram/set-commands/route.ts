import { NextRequest, NextResponse } from "next/server"

import { setBotCommands } from "@/lib/telegram/commands"

/**
 * Registers the bot command menu with Telegram.
 * Call with: curl -H "Authorization: Bearer $CRON_SECRET" "https://your-app.com/api/telegram/set-commands"
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "TELEGRAM_BOT_TOKEN is not set" },
      { status: 500 },
    )
  }

  try {
    const result = await setBotCommands(token)
    if (result.ok) {
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    )
  }
}
