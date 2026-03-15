import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const updateAccountSchema = z.object({
  bankName: z.string().min(1).optional(),
  accountType: z.string().min(1).optional(),
  profileId: z.string().uuid().nullable().optional(),
  interestRatePct: z.number().min(0).optional(),
  openingBalance: z.number().min(0).optional(),
})

async function verifyAccountOwnership(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  resourceId: string
) {
  const { data: account } = await supabase
    .from("bank_accounts")
    .select("id, family_id")
    .eq("id", resourceId)
    .single()
  if (!account) return null
  const { data: family } = await supabase
    .from("families")
    .select("id")
    .eq("id", account.family_id)
    .eq("household_id", accountId)
    .single()
  return family ? account : null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const { id } = await params
    const supabase = createSupabaseAdmin()
    const account = await verifyAccountOwnership(supabase, accountId, id)
    if (!account) {
      return NextResponse.json({ error: "Bank account not found" }, { status: 404 })
    }

    const body = await request.json()
    const parsed = updateAccountSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (parsed.data.bankName !== undefined) updates.bank_name = parsed.data.bankName
    if (parsed.data.accountType !== undefined) updates.account_type = parsed.data.accountType
    if (parsed.data.profileId !== undefined) updates.profile_id = parsed.data.profileId
    if (parsed.data.interestRatePct !== undefined) updates.interest_rate_pct = parsed.data.interestRatePct
    if (parsed.data.openingBalance !== undefined) updates.opening_balance = parsed.data.openingBalance

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("bank_accounts")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: "Failed to update bank account" }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const { id } = await params
    const supabase = createSupabaseAdmin()
    const account = await verifyAccountOwnership(supabase, accountId, id)
    if (!account) {
      return NextResponse.json({ error: "Bank account not found" }, { status: 404 })
    }

    const { error } = await supabase.from("bank_accounts").delete().eq("id", id)
    if (error) return NextResponse.json({ error: "Failed to delete bank account" }, { status: 500 })
    return new NextResponse(null, { status: 204 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
