import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const updatePolicySchema = z.object({
  name: z.string().min(1).optional(),
  type: z
    .enum([
      "term_life",
      "whole_life",
      "integrated_shield",
      "critical_illness",
      "endowment",
      "ilp",
      "personal_accident",
    ])
    .optional(),
  premiumAmount: z.number().min(0).optional(),
  frequency: z.enum(["monthly", "yearly"]).optional(),
  coverageAmount: z.number().min(0).nullable().optional(),
  yearlyOutflowDate: z.number().int().min(1).max(12).nullable().optional(),
})

async function verifyPolicyOwnership(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  resourceId: string
) {
  const { data: policy } = await supabase
    .from("insurance_policies")
    .select("id, profile_id")
    .eq("id", resourceId)
    .single()
  if (!policy) return null
  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", policy.profile_id)
    .single()
  if (!profile) return null
  const { data: family } = await supabase
    .from("families")
    .select("id")
    .eq("id", profile.family_id)
    .eq("household_id", accountId)
    .single()
  return family ? policy : null
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
    const policy = await verifyPolicyOwnership(supabase, accountId, id)
    if (!policy) {
      return NextResponse.json({ error: "Insurance policy not found" }, { status: 404 })
    }

    const body = await request.json()
    const parsed = updatePolicySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (parsed.data.name !== undefined) updates.name = parsed.data.name
    if (parsed.data.type !== undefined) updates.type = parsed.data.type
    if (parsed.data.premiumAmount !== undefined) updates.premium_amount = parsed.data.premiumAmount
    if (parsed.data.frequency !== undefined) updates.frequency = parsed.data.frequency
    if (parsed.data.coverageAmount !== undefined) updates.coverage_amount = parsed.data.coverageAmount
    if (parsed.data.yearlyOutflowDate !== undefined)
      updates.yearly_outflow_date = parsed.data.yearlyOutflowDate

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("insurance_policies")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: "Failed to update insurance policy" }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    console.error("[api/insurance] PATCH Error:", err)
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
    const policy = await verifyPolicyOwnership(supabase, accountId, id)
    if (!policy) {
      return NextResponse.json({ error: "Insurance policy not found" }, { status: 404 })
    }

    const { error } = await supabase.from("insurance_policies").delete().eq("id", id)
    if (error) return NextResponse.json({ error: "Failed to delete insurance policy" }, { status: 500 })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error("[api/insurance] DELETE Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
