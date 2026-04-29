import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { decodeLoanPii, encodeLoanPiiPatch } from "@/lib/repos/loans"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const updateLoanSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["housing", "personal", "car", "education"]).optional(),
  principal: z.number().positive().optional(),
  ratePct: z.number().min(0).optional(),
  tenureMonths: z.number().int().positive().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lender: z.string().nullable().optional(),
  useCpfOa: z.boolean().optional(),
  valuationLimit: z.number().positive().nullable().optional(),
  splitProfileId: z.uuid().nullable().optional(),
  splitPct: z.number().min(0).max(100).optional(),
  rateIncreasePct: z.number().min(0).nullable().optional(),
  propertyType: z.enum(["hdb", "private"]).nullable().optional(),
  lockInEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  earlyRepaymentPenaltyPct: z.number().min(0).nullable().optional(),
  maxAnnualPrepaymentPct: z.number().min(0).max(100).nullable().optional(),
})

async function verifyLoanOwnership(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  resourceId: string
) {
  const { data: loan } = await supabase
    .from("loans")
    .select("id, profile_id")
    .eq("id", resourceId)
    .single()
  if (!loan) return null
  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", loan.profile_id)
    .single()
  if (!profile) return null
  const { data: family } = await supabase
    .from("families")
    .select("id")
    .eq("id", profile.family_id)
    .eq("household_id", accountId)
    .single()
  return family ? loan : null
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
    const loan = await verifyLoanOwnership(supabase, accountId, id)
    if (!loan) {
      return NextResponse.json({ error: "Loan not found" }, { status: 404 })
    }

    const body = await request.json()
    const parsed = updateLoanSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (parsed.data.name !== undefined) updates.name = parsed.data.name
    if (parsed.data.type !== undefined) updates.type = parsed.data.type
    if (parsed.data.principal !== undefined) {
      updates.principal = parsed.data.principal
      Object.assign(updates, encodeLoanPiiPatch({ principal: parsed.data.principal }))
    }
    if (parsed.data.ratePct !== undefined) updates.rate_pct = parsed.data.ratePct
    if (parsed.data.tenureMonths !== undefined) updates.tenure_months = parsed.data.tenureMonths
    if (parsed.data.startDate !== undefined) updates.start_date = parsed.data.startDate
    if (parsed.data.lender !== undefined) {
      updates.lender = parsed.data.lender
      Object.assign(updates, encodeLoanPiiPatch({ lender: parsed.data.lender }))
    }
    if (parsed.data.useCpfOa !== undefined) updates.use_cpf_oa = parsed.data.useCpfOa
    if (parsed.data.valuationLimit !== undefined) updates.valuation_limit = parsed.data.valuationLimit
    if (parsed.data.splitProfileId !== undefined) updates.split_profile_id = parsed.data.splitProfileId
    if (parsed.data.splitPct !== undefined) updates.split_pct = parsed.data.splitPct
    if (parsed.data.rateIncreasePct !== undefined) updates.rate_increase_pct = parsed.data.rateIncreasePct
    if (parsed.data.propertyType !== undefined) updates.property_type = parsed.data.propertyType
    if (parsed.data.lockInEndDate !== undefined) updates.lock_in_end_date = parsed.data.lockInEndDate
    if (parsed.data.earlyRepaymentPenaltyPct !== undefined) updates.early_repayment_penalty_pct = parsed.data.earlyRepaymentPenaltyPct
    if (parsed.data.maxAnnualPrepaymentPct !== undefined) updates.max_annual_prepayment_pct = parsed.data.maxAnnualPrepaymentPct

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("loans")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: "Failed to update loan" }, { status: 500 })
    return NextResponse.json({ ...data, ...decodeLoanPii(data) })
  } catch (err) {
    console.error("[api/loans] PATCH Error:", err)
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
    const loan = await verifyLoanOwnership(supabase, accountId, id)
    if (!loan) {
      return NextResponse.json({ error: "Loan not found" }, { status: 404 })
    }

    const { error } = await supabase.from("loans").delete().eq("id", id)
    if (error) return NextResponse.json({ error: "Failed to delete loan" }, { status: 500 })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error("[api/loans] DELETE Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
