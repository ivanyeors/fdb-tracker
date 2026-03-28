import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const reconcileSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-01$/),
  actualBalance: z.number(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id: accountId } = await params
    const body = await request.json()
    const parsed = reconcileSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()

    // Verify ownership
    const { data: account } = await supabase
      .from("bank_accounts")
      .select("id, family_id")
      .eq("id", accountId)
      .single()

    if (!account) {
      return NextResponse.json(
        { error: "Bank account not found" },
        { status: 404 },
      )
    }

    const { data: family } = await supabase
      .from("families")
      .select("id")
      .eq("id", account.family_id)
      .eq("household_id", session.accountId)
      .single()

    if (!family) {
      return NextResponse.json(
        { error: "Bank account not found" },
        { status: 404 },
      )
    }

    // Upsert reconciliation snapshot
    const { data: snapshot, error } = await supabase
      .from("bank_balance_snapshots")
      .upsert(
        {
          account_id: accountId,
          month: parsed.data.month,
          opening_balance: parsed.data.actualBalance,
          closing_balance: parsed.data.actualBalance,
          is_reconciliation: true,
        },
        { onConflict: "account_id,month" },
      )
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: "Failed to save reconciliation" },
        { status: 500 },
      )
    }

    return NextResponse.json(snapshot)
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
