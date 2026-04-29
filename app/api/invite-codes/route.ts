import { NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { generateInviteCode } from "@/lib/auth/signup-codes"

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? ""

const createInviteSchema = z.object({
  targetProfileId: z.uuid().optional(),
})

export async function GET() {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("signup_codes")
    .select("id, code, target_profile_id, expires_at, used, created_at")
    .eq("type", "invite")
    .eq("created_by_household_id", session.accountId)
    .eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch invite codes" },
      { status: 500 }
    )
  }

  const codes = (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    targetProfileId: row.target_profile_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    botUrl: BOT_USERNAME
      ? `https://t.me/${BOT_USERNAME}?start=join_${row.code}`
      : null,
  }))

  return NextResponse.json(codes)
}

export async function POST(request: Request) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const parsed = createInviteSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const result = await generateInviteCode(
      session.accountId,
      parsed.data.targetProfileId
    )

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    const botUrl = BOT_USERNAME
      ? `https://t.me/${BOT_USERNAME}?start=join_${result.code}`
      : null

    return NextResponse.json({ code: result.code, botUrl })
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
