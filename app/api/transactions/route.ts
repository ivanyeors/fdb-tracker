import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { z } from "zod"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const querySchema = z.object({
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  statementType: z.enum(["bank", "cc"]).optional(),
})

export async function GET(request: NextRequest) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const params = Object.fromEntries(request.nextUrl.searchParams)
  const query = querySchema.parse(params)
  const supabase = createSupabaseAdmin()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let qb = (supabase as any)
    .from("bank_transactions")
    .select(
      "*, outflow_categories(id, name, icon)",
    )
    .order("txn_date", { ascending: true })

  if (query.profileId) qb = qb.eq("profile_id", query.profileId)
  if (query.familyId) qb = qb.eq("family_id", query.familyId)
  if (query.month) qb = qb.eq("month", query.month)
  if (query.statementType)
    qb = qb.eq("statement_type", query.statementType)

  const { data, error } = await qb

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

const patchSchema = z.object({
  updates: z.array(
    z.object({
      id: z.string().uuid(),
      categoryId: z.string().uuid().nullable(),
    }),
  ),
  categoryRules: z
    .array(
      z.object({
        pattern: z.string(),
        categoryId: z.string().uuid(),
      }),
    )
    .optional(),
})

export async function PATCH(request: Request) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = patchSchema.parse(await request.json())
    const supabase = createSupabaseAdmin()

    // Batch update category_id
    for (const update of body.updates) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("bank_transactions")
        .update({ category_id: update.categoryId, updated_at: new Date().toISOString() })
        .eq("id", update.id)

      if (error) {
        return NextResponse.json(
          { error: `Failed to update transaction ${update.id}: ${error.message}` },
          { status: 500 },
        )
      }
    }

    // Save category rules
    if (body.categoryRules && body.categoryRules.length > 0) {
      // Get household_id from the first transaction
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: txn } = await (supabase as any)
        .from("bank_transactions")
        .select("family_id")
        .eq("id", body.updates[0]?.id)
        .single()

      if (txn) {
        const { data: family } = await supabase
          .from("families")
          .select("household_id")
          .eq("id", txn.family_id)
          .single()

        if (family) {
          const ruleRows = body.categoryRules.map((rule) => ({
            household_id: family.household_id,
            match_pattern: rule.pattern,
            category_id: rule.categoryId,
            source: "user" as const,
            priority: 10,
          }))

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from("category_rules")
            .upsert(ruleRows, { onConflict: "household_id,match_pattern" })
        }
      }
    }

    return NextResponse.json({ updated: body.updates.length })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: err.issues },
        { status: 400 },
      )
    }
    console.error("[transactions] PATCH error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update" },
      { status: 500 },
    )
  }
}
