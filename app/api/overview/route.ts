import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { fetchOverviewData } from "@/lib/api/overview-data"

const overviewQuerySchema = z.object({
  profileId: z.uuid().optional(),
  familyId: z.uuid().optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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
    const parsed = overviewQuerySchema.safeParse({
      profileId: searchParams.get("profileId") ?? undefined,
      familyId: searchParams.get("familyId") ?? undefined,
      month: searchParams.get("month") ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters" },
        { status: 400 }
      )
    }

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      parsed.data.profileId ?? null,
      parsed.data.familyId ?? null
    )
    if (!resolved) {
      return NextResponse.json(
        { error: "Family or profile not found" },
        { status: 404 }
      )
    }

    const result = await fetchOverviewData(supabase, {
      profileIds: resolved.profileIds,
      familyId: resolved.familyId,
      profileId: parsed.data.profileId ?? null,
      monthFilter: parsed.data.month ?? null,
    })

    return NextResponse.json(result)
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
