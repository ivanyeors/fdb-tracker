import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { z } from "zod"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const householdId = request.nextUrl.searchParams.get("householdId")
  const categoryId = request.nextUrl.searchParams.get("categoryId")

  if (!householdId)
    return NextResponse.json(
      { error: "householdId is required" },
      { status: 400 }
    )

  const supabase = createSupabaseAdmin()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let qb = (supabase as any)
    .from("category_rules")
    .select("id, match_pattern, category_id, source, priority, created_at")
    .eq("household_id", householdId)
    .order("priority", { ascending: false })

  if (categoryId) qb = qb.eq("category_id", categoryId)

  const { data, error } = await qb

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}

const deleteSchema = z.object({
  id: z.string().uuid(),
})

export async function DELETE(request: Request) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = deleteSchema.parse(await request.json())
    const supabase = createSupabaseAdmin()

    // Only allow deleting user-created rules
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rule } = await (supabase as any)
      .from("category_rules")
      .select("id, source")
      .eq("id", body.id)
      .single()

    if (!rule)
      return NextResponse.json({ error: "Rule not found" }, { status: 404 })

    if (rule.source === "system") {
      return NextResponse.json(
        { error: "Cannot delete system rules" },
        { status: 403 }
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("category_rules")
      .delete()
      .eq("id", body.id)

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ deleted: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: err.issues },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete" },
      { status: 500 }
    )
  }
}
