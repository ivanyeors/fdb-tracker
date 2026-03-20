import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { verifyLoanInHousehold } from "@/lib/api/verify-loan-in-household"

const createSchema = z.object({
  loanId: z.string().uuid(),
  principalWithdrawn: z.number().positive(),
  withdrawalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  usageType: z
    .enum(["downpayment", "monthly", "stamp_duty", "legal", "hps", "other"])
    .optional(),
})

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const loanOk = await verifyLoanInHousehold(supabase, session.accountId, parsed.data.loanId)
    if (!loanOk) {
      return NextResponse.json({ error: "Loan not found" }, { status: 404 })
    }

    const { data, error } = await supabase
      .from("cpf_housing_usage")
      .insert({
        loan_id: parsed.data.loanId,
        principal_withdrawn: parsed.data.principalWithdrawn,
        accrued_interest: 0,
        withdrawal_date: parsed.data.withdrawalDate,
        usage_type: parsed.data.usageType ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error("[api/cpf/housing/usage] insert", error)
      return NextResponse.json({ error: "Failed to create record" }, { status: 500 })
    }
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error("[api/cpf/housing/usage] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
