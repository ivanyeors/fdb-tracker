import { NextRequest, NextResponse } from "next/server"

/**
 * Returns Telegram webhook status for debugging.
 * Call with: curl -H "Authorization: Bearer $CRON_SECRET" "https://your-app.com/api/telegram/webhook-info"
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
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getWebhookInfo`,
    )
    const data = (await res.json()) as {
      ok?: boolean
      result?: { url?: string; has_custom_certificate?: boolean }
      description?: string
    }

    if (!data.ok) {
      return NextResponse.json(
        { ok: false, error: data.description ?? "Unknown error" },
        { status: 400 },
      )
    }

    const url = data.result?.url ?? null
    return NextResponse.json({
      ok: true,
      webhookUrl: url,
      isConfigured: !!url,
      hint: !url
        ? "Webhook not set. Call /api/telegram/set-webhook to register."
        : undefined,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    )
  }
}
