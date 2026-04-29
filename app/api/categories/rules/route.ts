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

const createSchema = z.object({
  householdId: z.uuid(),
  categoryId: z.uuid(),
  matchPattern: z
    .string()
    .min(1)
    .max(200)
    .transform((s) => s.trim().toUpperCase()),
})

export async function POST(request: Request) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = createSchema.parse(await request.json())
    const supabase = createSupabaseAdmin()

    // Check for duplicate pattern in this household
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from("category_rules")
      .select("id, category_id")
      .eq("household_id", body.householdId)
      .eq("match_pattern", body.matchPattern)
      .limit(1)

    if (existing && existing.length > 0) {
      // Find category name for better error message
      const { data: cat } = await supabase
        .from("outflow_categories")
        .select("name")
        .eq("id", existing[0].category_id)
        .single()

      return NextResponse.json(
        {
          error: `This pattern is already assigned to "${cat?.name ?? "another category"}"`,
        },
        { status: 409 }
      )
    }

    // Verify the category exists
    const { data: category } = await supabase
      .from("outflow_categories")
      .select("id")
      .eq("id", body.categoryId)
      .eq("household_id", body.householdId)
      .single()

    if (!category) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("category_rules")
      .insert({
        household_id: body.householdId,
        match_pattern: body.matchPattern,
        category_id: body.categoryId,
        source: "user",
        priority: 10,
      })
      .select()
      .single()

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: err.issues },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create rule" },
      { status: 500 }
    )
  }
}

const deleteSchema = z.object({
  id: z.uuid(),
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
