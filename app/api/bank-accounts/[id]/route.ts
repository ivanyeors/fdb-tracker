import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const updateAccountSchema = z.object({
  bankName: z.string().min(1).optional(),
  accountType: z.string().min(1).optional(),
  accountNumber: z.string().nullable().optional(),
  profileId: z.string().uuid().nullable().optional(),
  interestRatePct: z.number().min(0).optional(),
  openingBalance: z.number().min(0).optional(),
  lockedAmount: z.number().min(0).optional(),
  ocbc360: z
    .object({
      insure_met: z.boolean().optional(),
      invest_met: z.boolean().optional(),
      linked_insurance_policy_id: z.string().uuid().nullable().optional(),
      linked_investment_id: z.string().uuid().nullable().optional(),
    })
    .optional(),
})

async function verifyAccountOwnership(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  resourceId: string
) {
  const { data: account } = await supabase
    .from("bank_accounts")
    .select("id, family_id, account_type")
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
    if (parsed.data.accountNumber !== undefined) updates.account_number = parsed.data.accountNumber
    if (parsed.data.profileId !== undefined) updates.profile_id = parsed.data.profileId
    if (parsed.data.interestRatePct !== undefined) updates.interest_rate_pct = parsed.data.interestRatePct
    if (parsed.data.openingBalance !== undefined) updates.opening_balance = parsed.data.openingBalance
    if (parsed.data.lockedAmount !== undefined) updates.locked_amount = parsed.data.lockedAmount

    const ocbc360 = parsed.data.ocbc360
    const ocbcHasConcrete =
      ocbc360 !== undefined &&
      (ocbc360.insure_met !== undefined ||
        ocbc360.invest_met !== undefined ||
        ocbc360.linked_insurance_policy_id !== undefined ||
        ocbc360.linked_investment_id !== undefined)
    if (Object.keys(updates).length === 0 && !ocbcHasConcrete) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    if (ocbc360 && ocbcHasConcrete) {
      if (account.account_type !== "ocbc_360") {
        return NextResponse.json({ error: "Not an OCBC 360 account" }, { status: 400 })
      }
      const ocbcUpdates: Record<string, unknown> = {}
      if (ocbc360.insure_met !== undefined) ocbcUpdates.insure_met = ocbc360.insure_met
      if (ocbc360.invest_met !== undefined) ocbcUpdates.invest_met = ocbc360.invest_met
      if (ocbc360.linked_insurance_policy_id !== undefined)
        ocbcUpdates.linked_insurance_policy_id = ocbc360.linked_insurance_policy_id
      if (ocbc360.linked_investment_id !== undefined)
        ocbcUpdates.linked_investment_id = ocbc360.linked_investment_id
      // Clear linked record when toggling off
      if (ocbc360.insure_met === false) ocbcUpdates.linked_insurance_policy_id = null
      if (ocbc360.invest_met === false) ocbcUpdates.linked_investment_id = null

      if (Object.keys(ocbcUpdates).length > 0) {
        const { data: existing } = await supabase
          .from("bank_account_ocbc360_config")
          .select("id")
          .eq("account_id", id)
          .maybeSingle()

        if (existing) {
          const { error: ocbcErr } = await supabase
            .from("bank_account_ocbc360_config")
            .update(ocbcUpdates)
            .eq("account_id", id)
          if (ocbcErr) {
            return NextResponse.json({ error: "Failed to update OCBC 360 settings" }, { status: 500 })
          }
        } else {
          const { error: insErr } = await supabase.from("bank_account_ocbc360_config").insert({
            account_id: id,
            salary_met: false,
            save_met: false,
            spend_met: false,
            insure_met: false,
            invest_met: false,
            grow_met: false,
            ...ocbcUpdates,
          })
          if (insErr) {
            return NextResponse.json({ error: "Failed to update OCBC 360 settings" }, { status: 500 })
          }
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      const { data, error } = await supabase
        .from("bank_accounts")
        .update(updates)
        .eq("id", id)
        .select()
        .single()

      if (error) return NextResponse.json({ error: "Failed to update bank account" }, { status: 500 })
      return NextResponse.json(data)
    }

    return NextResponse.json({ ok: true })
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
