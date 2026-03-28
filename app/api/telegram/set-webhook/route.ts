import { NextRequest, NextResponse } from "next/server"

import { setBotCommands } from "@/lib/telegram/commands"

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "TELEGRAM_BOT_TOKEN is not set" },
      { status: 500 }
    )
  }

  if (!baseUrl) {
    return NextResponse.json(
      { ok: false, error: "NEXT_PUBLIC_APP_URL is not set" },
      { status: 500 }
    )
  }

  const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/telegram/webhook`
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET

  const params = new URLSearchParams({ url: webhookUrl })
  if (webhookSecret) {
    params.set("secret_token", webhookSecret)
  }
  const apiUrl = `https://api.telegram.org/bot${token}/setWebhook?${params.toString()}`

  try {
    const res = await fetch(apiUrl)
    const data = (await res.json()) as { ok?: boolean; description?: string }

    if (data.ok) {
      const cmdResult = await setBotCommands(token)
      return NextResponse.json({
        ok: true,
        webhookUrl,
        commandsSet: cmdResult.ok,
        commandsError: cmdResult.error,
      })
    }

    return NextResponse.json(
      { ok: false, error: data.description ?? res.statusText },
      { status: 400 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
