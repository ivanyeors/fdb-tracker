import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { z } from "zod"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { drainSummaryRefreshQueue } from "@/lib/repos/summary-refresh-queue"
import { createSupabaseAdmin } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const householdId = request.nextUrl.searchParams.get("householdId")
  if (!householdId)
    return NextResponse.json(
      { error: "householdId is required" },
      { status: 400 }
    )

  const supabase = createSupabaseAdmin()

  // Fetch categories and rule counts in parallel
  const [categoriesResult, ruleCountsResult] = await Promise.all([
    supabase
      .from("outflow_categories")
      .select("id, name, icon, sort_order, is_system, created_at")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("category_rules")
      .select("category_id")
      .eq("household_id", householdId),
  ])

  const { data: categories, error } = categoriesResult
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ruleCountMap = new Map<string, number>()
  for (const row of ruleCountsResult.data ?? []) {
    ruleCountMap.set(
      row.category_id,
      (ruleCountMap.get(row.category_id) ?? 0) + 1
    )
  }

  const result = (categories ?? []).map((cat) => ({
    ...cat,
    ruleCount: ruleCountMap.get(cat.id) ?? 0,
  }))

  return NextResponse.json(result)
}

const createSchema = z.object({
  householdId: z.uuid(),
  name: z.string().min(1).max(50),
  icon: z.string().max(50).optional(),
})

export async function POST(request: Request) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = createSchema.parse(await request.json())
    const supabase = createSupabaseAdmin()

    const trimmedName = body.name.trim()

    // Check for duplicate name (case-insensitive)
    const { data: existing } = await supabase
      .from("outflow_categories")
      .select("id")
      .eq("household_id", body.householdId)
      .ilike("name", trimmedName)
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: "A category with this name already exists" },
        { status: 409 }
      )
    }

    // Get max sort_order
    const { data: maxSort } = await supabase
      .from("outflow_categories")
      .select("sort_order")
      .eq("household_id", body.householdId)
      .order("sort_order", { ascending: false })
      .limit(1)

    const nextSort = ((maxSort?.[0]?.sort_order as number) ?? 0) + 1

    const { data, error } = await supabase
      .from("outflow_categories")
      .insert({
        household_id: body.householdId,
        name: trimmedName,
        icon: body.icon ?? null,
        sort_order: nextSort,
        is_system: false,
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
      { error: err instanceof Error ? err.message : "Failed to create" },
      { status: 500 }
    )
  }
}

const updateSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50).optional(),
  icon: z.string().max(50).nullable().optional(),
  sortOrder: z.number().int().optional(),
})

export async function PATCH(request: Request) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = updateSchema.parse(await request.json())
    const supabase = createSupabaseAdmin()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {}
    if (body.name !== undefined) updates.name = body.name.trim()
    if (body.icon !== undefined) updates.icon = body.icon
    if (body.sortOrder !== undefined) updates.sort_order = body.sortOrder

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      )
    }

    // Check for duplicate name when renaming (case-insensitive)
    if (updates.name) {
      const { data: cat } = await supabase
        .from("outflow_categories")
        .select("household_id")
        .eq("id", body.id)
        .single()

      if (cat) {
        const { data: existing } = await supabase
          .from("outflow_categories")
          .select("id")
          .eq("household_id", cat.household_id)
          .ilike("name", updates.name)
          .neq("id", body.id)
          .limit(1)

        if (existing && existing.length > 0) {
          return NextResponse.json(
            { error: "A category with this name already exists" },
            { status: 409 }
          )
        }
      }
    }

    const { data, error } = await supabase
      .from("outflow_categories")
      .update(updates)
      .eq("id", body.id)
      .select()
      .single()

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: err.issues },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update" },
      { status: 500 }
    )
  }
}

const deleteSchema = z.object({
  id: z.uuid(),
  reassignTo: z.uuid().optional(),
})

export async function DELETE(request: Request) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = deleteSchema.parse(await request.json())
    const supabase = createSupabaseAdmin()

    // Verify category exists and is not a system category
    const { data: cat } = await supabase
      .from("outflow_categories")
      .select("id, is_system, household_id")
      .eq("id", body.id)
      .single()

    if (!cat) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 })
    }

    if (cat.is_system) {
      return NextResponse.json(
        { error: "Cannot delete system categories" },
        { status: 403 }
      )
    }

    // Capture scopes before the bulk reassign so summary rows can refresh.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: affectedTxns } = await (supabase as any)
      .from("bank_transactions")
      .select("profile_id, family_id, month, statement_type")
      .eq("category_id", body.id)

    // Reassign transactions to another category or null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("bank_transactions")
      .update({ category_id: body.reassignTo ?? null })
      .eq("category_id", body.id)

    if (affectedTxns && affectedTxns.length > 0) {
      await drainSummaryRefreshQueue(supabase, {
        scopes: affectedTxns as Array<{
          profile_id: string
          family_id: string
          month: string
          statement_type: "bank" | "cc"
        }>,
      })
    }

    // Also reassign outflow_entries
    if (body.reassignTo) {
      await supabase
        .from("outflow_entries")
        .update({ category_id: body.reassignTo })
        .eq("category_id", body.id)
    } else {
      // Can't set null on outflow_entries if category_id is required,
      // so delete them
      await supabase.from("outflow_entries").delete().eq("category_id", body.id)
    }

    // Delete associated rules
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("category_rules")
      .delete()
      .eq("category_id", body.id)

    // Delete the category
    const { error } = await supabase
      .from("outflow_categories")
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
