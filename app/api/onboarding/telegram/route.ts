import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import {
  encodeHouseholdPiiPatch,
  hashHouseholdTelegramChatId,
} from "@/lib/repos/households"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { mergePublicHousehold } from "@/lib/onboarding/merge-public-household"
import { z } from "zod"

const telegramSchema = z.object({
  telegramChatId: z.string().optional().default(""),
  mergePublicHouseholdId: z.string().uuid().optional(),
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

    const { telegramChatId, mergePublicHouseholdId } = parsed.data
    const supabase = createSupabaseAdmin()
    const trimmedChatId = telegramChatId.trim()

    // If merge requested, execute it first
    if (mergePublicHouseholdId) {
      const result = await mergePublicHousehold(
        supabase,
        mergePublicHouseholdId,
        session.accountId
      )
      if (!result.success) {
        return NextResponse.json(
          { error: result.error ?? "Merge failed" },
          { status: 400 },
        )
      }
      return NextResponse.json({
        success: true,
        merged: true,
        migratedProfileIds: result.migratedProfileIds,
      })
    }

    // Check for conflicting public household with this chat ID
    if (trimmedChatId) {
      const chatIdHash = hashHouseholdTelegramChatId(trimmedChatId)
      const { data: publicHousehold } = await supabase
        .from("households")
        .select("id")
        .eq("telegram_chat_id_hash", chatIdHash)
        .neq("id", session.accountId)
        .eq("account_type", "public")
        .maybeSingle()

      if (publicHousehold) {
        return NextResponse.json({
          conflict: true,
          publicHouseholdId: publicHousehold.id,
        })
      }
    }

    // No conflict — save the chat ID
    const newChatId = trimmedChatId || null
    const { error } = await supabase
      .from("households")
      .update({
        telegram_chat_id: newChatId,
        ...encodeHouseholdPiiPatch({ telegram_chat_id: newChatId }),
      })
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
