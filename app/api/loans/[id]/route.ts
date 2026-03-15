import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
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
    if (parsed.data.principal !== undefined) updates.principal = parsed.data.principal
    if (parsed.data.ratePct !== undefined) updates.rate_pct = parsed.data.ratePct
    if (parsed.data.tenureMonths !== undefined) updates.tenure_months = parsed.data.tenureMonths
    if (parsed.data.startDate !== undefined) updates.start_date = parsed.data.startDate
    if (parsed.data.lender !== undefined) updates.lender = parsed.data.lender
    if (parsed.data.useCpfOa !== undefined) updates.use_cpf_oa = parsed.data.useCpfOa

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
    return NextResponse.json(data)
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
