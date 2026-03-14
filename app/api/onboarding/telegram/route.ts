import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { z } from "zod"

const telegramSchema = z.object({
  telegramChatId: z.string().optional().default(""),
})

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const parsed = telegramSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", message: parsed.error.message },
        { status: 400 },
      )
    }

    const { telegramChatId } = parsed.data
    const supabase = createSupabaseAdmin()

    const { error } = await supabase
      .from("households")
      .update({ telegram_chat_id: telegramChatId?.trim() || null })
      .eq("id", session.accountId)

    if (error) {
      console.error("Onboarding telegram error:", error)
      return NextResponse.json(
        { error: "Failed to save Telegram chat ID" },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Onboarding telegram error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
