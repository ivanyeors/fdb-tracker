import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"

const notesQuerySchema = z.object({
  symbol: z.string().min(1),
  profileId: z.uuid().optional(),
  familyId: z.uuid().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const { searchParams } = request.nextUrl
    const parsed = notesQuerySchema.safeParse({
      symbol: searchParams.get("symbol") ?? undefined,
      profileId: searchParams.get("profileId") ?? undefined,
      familyId: searchParams.get("familyId") ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters" },
        { status: 400 }
      )
    }

    const { symbol, profileId, familyId } = parsed.data
    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      profileId ?? null,
      familyId ?? null
    )
    if (!resolved) {
      return NextResponse.json(
        { error: "Family or profile not found" },
        { status: 404 }
      )
    }

    let query = supabase
      .from("investment_transactions")
      .select("id, type, journal_text, created_at")
      .eq("family_id", resolved.familyId)
      .eq("symbol", symbol)
      .not("journal_text", "is", null)
      .neq("journal_text", "")
      .order("created_at", { ascending: true })

    if (profileId) {
      query = query.or(`profile_id.eq.${profileId},profile_id.is.null`)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch notes" },
        { status: 500 }
      )
    }

    return NextResponse.json({ notes: data })
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
