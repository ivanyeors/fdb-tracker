import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = request.nextUrl
    const apiKeyId = searchParams.get("apiKeyId") ?? undefined

    const supabase = createSupabaseAdmin()
    let query = supabase
      .from("linked_telegram_accounts")
      .select("id, telegram_user_id, telegram_username, telegram_chat_id, linked_at, link_api_key_id")
      .eq("household_id", session.accountId)
      .order("linked_at", { ascending: false })

    if (apiKeyId) {
      query = query.eq("link_api_key_id", apiKeyId)
    }

    const { data, error } = await query

    if (error) {
      console.error("[linked-telegram-accounts] GET error:", error)
      return NextResponse.json({ error: "Failed to fetch linked accounts" }, { status: 500 })
    }

    const result = (data ?? []).map((row) => ({
      id: row.id,
      telegramUserId: row.telegram_user_id,
      telegramUsername: row.telegram_username ?? null,
      linkedAt: row.linked_at,
      apiKeyId: row.link_api_key_id,
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error("[linked-telegram-accounts] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
