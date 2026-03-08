import { NextResponse } from "next/server"
import { z } from "zod"

const bodySchema = z.object({
  chat_id: z.string().min(1, "Chat ID is required"),
})

export async function POST(request: Request) {
  try {
    const json = await request.json()
    const parsed = bodySchema.safeParse(json)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message },
        { status: 400 },
      )
    }

    const { chat_id } = parsed.data
    const botToken = process.env.TELEGRAM_BOT_TOKEN

    if (!botToken) {
      return NextResponse.json(
        { success: false, error: "Telegram bot token not configured" },
        { status: 500 },
      )
    }

    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`
    const res = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id,
        text: "✅ Connected to fdb-tracker",
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      const description =
        (data as { description?: string }).description ?? "Failed to send message"
      return NextResponse.json(
        { success: false, error: description },
        { status: 400 },
      )
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 },
    )
  }
}
