import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { verifyLoanInHousehold } from "@/lib/api/verify-loan-in-household"

const patchSchema = z.object({
  principalWithdrawn: z.number().positive().optional(),
  withdrawalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  usageType: z
    .enum(["downpayment", "monthly", "stamp_duty", "legal", "hps", "other"])
    .nullable()
    .optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id } = await params

    const body = await request.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const { data: row } = await supabase
      .from("cpf_housing_usage")
      .select("id, loan_id")
      .eq("id", id)
      .single()

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const loanOk = await verifyLoanInHousehold(supabase, session.accountId, row.loan_id)
    if (!loanOk) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const updates: Record<string, unknown> = {}
    if (parsed.data.principalWithdrawn !== undefined) {
      updates.principal_withdrawn = parsed.data.principalWithdrawn
    }
    if (parsed.data.withdrawalDate !== undefined) {
      updates.withdrawal_date = parsed.data.withdrawalDate
    }
    if (parsed.data.usageType !== undefined) {
      updates.usage_type = parsed.data.usageType
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("cpf_housing_usage")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to update" }, { status: 500 })
    }
    return NextResponse.json(data)
  } catch (err) {
    console.error("[api/cpf/housing/usage/id] PATCH", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id } = await params

    const supabase = createSupabaseAdmin()
    const { data: row } = await supabase
      .from("cpf_housing_usage")
      .select("id, loan_id")
      .eq("id", id)
      .single()

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const loanOk = await verifyLoanInHousehold(supabase, session.accountId, row.loan_id)
    if (!loanOk) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const { error } = await supabase.from("cpf_housing_usage").delete().eq("id", id)
    if (error) {
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
    }
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error("[api/cpf/housing/usage/id] DELETE", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
