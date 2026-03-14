import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { z } from "zod"

const usersSchema = z.object({
  mode: z.enum(["first-time", "new-family", "resume"]).optional().default("first-time"),
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
    const parsed = usersSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", message: parsed.error.message },
        { status: 400 },
      )
    }

    const { mode, userCount } = parsed.data
    const supabase = createSupabaseAdmin()
    const isNewFamily = mode === "new-family"

    let familyId: string

    if (isNewFamily) {
      const { count: familyCount } = await supabase
        .from("families")
        .select("id", { count: "exact", head: true })
        .eq("household_id", session.accountId)
      const nextNum = (familyCount ?? 0) + 1
      const { data: newFamily, error: familyError } = await supabase
        .from("families")
        .insert({
          household_id: session.accountId,
          name: `Family ${nextNum}`,
          user_count: userCount,
        })
        .select("id")
        .single()
      if (familyError || !newFamily) {
        console.error("Onboarding users family create error:", familyError)
        return NextResponse.json(
          { error: "Failed to create family" },
          { status: 500 },
        )
      }
      familyId = newFamily.id
    } else {
      const { data: existingFamily } = await supabase
        .from("families")
        .select("id")
        .eq("household_id", session.accountId)
        .order("created_at", { ascending: true })
        .limit(1)
        .single()

      if (existingFamily) {
        familyId = existingFamily.id
        await supabase
          .from("families")
          .update({ user_count: userCount })
          .eq("id", familyId)
      } else {
        const { data: newFamily, error: familyError } = await supabase
          .from("families")
          .insert({
            household_id: session.accountId,
            name: "Family 1",
            user_count: userCount,
          })
          .select("id")
          .single()
        if (familyError || !newFamily) {
          console.error("Onboarding users family create error:", familyError)
          return NextResponse.json(
            { error: "Failed to create family" },
            { status: 500 },
          )
        }
        familyId = newFamily.id
      }

      await supabase
        .from("households")
        .update({ user_count: userCount })
        .eq("id", session.accountId)
    }

    return NextResponse.json({ success: true, familyId })
  } catch (error) {
    console.error("Onboarding users error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
