import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { z } from "zod"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { decodeBankTransactionPii } from "@/lib/repos/bank-transactions"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const querySchema = z.object({
  profileId: z.uuid().optional(),
  familyId: z.uuid().optional(),
  startMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function GET(request: NextRequest) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const params = Object.fromEntries(request.nextUrl.searchParams)
  const query = querySchema.parse(params)

  if (!query.profileId && !query.familyId) {
    return NextResponse.json(
      { error: "profileId or familyId is required" },
      { status: 400 }
    )
  }

  const supabase = createSupabaseAdmin()

  // Fetch all transactions in the date range with category names
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let qb = (supabase as any)
    .from("bank_transactions")
    .select(
      "month, amount_enc, txn_type, exclude_from_spending, outflow_categories(name)",
    )
    .gte("month", query.startMonth)
    .lte("month", query.endMonth)
    .eq("txn_type", "debit")
    .eq("exclude_from_spending", false)

  if (query.profileId) qb = qb.eq("profile_id", query.profileId)
  else if (query.familyId) qb = qb.eq("family_id", query.familyId)

  const { data, error } = await qb

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  // Aggregate by month + category
  const byMonth = new Map<
    string,
    Map<string, { total: number; count: number }>
  >()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of data ?? []) {
    const month = row.month as string
    const name =
      (row.outflow_categories as { name: string } | null)?.name ??
      "Uncategorized"
    const decodedAmount = decodeBankTransactionPii({
      amount_enc: row.amount_enc,
    }).amount
    const amount = Math.abs(decodedAmount ?? 0)

    if (!byMonth.has(month)) byMonth.set(month, new Map())
    const cats = byMonth.get(month)!
    const existing = cats.get(name) ?? { total: 0, count: 0 }
    existing.total += amount
    existing.count++
    cats.set(name, existing)
  }

  // Build response sorted by month, categories sorted by total desc
  const result = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, cats]) => ({
      month,
      categories: Array.from(cats.entries())
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.total - a.total),
    }))

  return NextResponse.json(result)
}
