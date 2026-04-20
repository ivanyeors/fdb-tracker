import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { z } from "zod"

const createFamilySchema = z.object({
  name: z.string().min(1).max(100),
  userCount: z.number().int().min(1).max(6),
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
    const parsed = createFamilySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", message: parsed.error.message },
        { status: 400 },
      )
    }

    const { name, userCount } = parsed.data
    const supabase = createSupabaseAdmin()

    // Guard: max 10 families per household
    const { count } = await supabase
      .from("families")
      .select("id", { count: "exact", head: true })
      .eq("household_id", session.accountId)
    if ((count ?? 0) >= 10) {
      return NextResponse.json(
        { error: "Maximum 10 families per account" },
        { status: 400 },
      )
    }

    const { data: family, error } = await supabase
      .from("families")
      .insert({
        household_id: session.accountId,
        name,
        user_count: userCount,
      })
      .select("id, name")
      .single()

    if (error || !family) {
      console.error("Create family error:", error)
      return NextResponse.json(
        { error: "Failed to create family" },
        { status: 500 },
      )
    }

    return NextResponse.json(family)
  } catch (err) {
    console.error("POST /api/families error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
