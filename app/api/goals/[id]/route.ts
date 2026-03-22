import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const updateGoalSchema = z.object({
  name: z.string().min(1).optional(),
  targetAmount: z.number().positive().optional(),
  currentAmount: z.number().min(0).optional(),
  monthlyAutoAmount: z.number().min(0).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  category: z
    .enum(["dream_home", "gadget", "travel", "wardrobe", "car", "custom"])
    .optional(),
  linkedBankAccountId: z.string().uuid().nullable().optional(),
  profileId: z.string().uuid().nullable().optional(),
})

async function verifyGoalOwnership(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  resourceId: string
) {
  const { data: goal } = await supabase
    .from("savings_goals")
    .select("id, family_id")
    .eq("id", resourceId)
    .single()
  if (!goal) return null
  const { data: family } = await supabase
    .from("families")
    .select("id")
    .eq("id", goal.family_id)
    .eq("household_id", accountId)
    .single()
  return family ? goal : null
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
    const goal = await verifyGoalOwnership(supabase, accountId, id)
    if (!goal) {
      return NextResponse.json({ error: "Savings goal not found" }, { status: 404 })
    }

    const body = await request.json()
    const parsed = updateGoalSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (parsed.data.name !== undefined) updates.name = parsed.data.name
    if (parsed.data.targetAmount !== undefined) updates.target_amount = parsed.data.targetAmount
    if (parsed.data.currentAmount !== undefined) updates.current_amount = parsed.data.currentAmount
    if (parsed.data.monthlyAutoAmount !== undefined) updates.monthly_auto_amount = parsed.data.monthlyAutoAmount
    if (parsed.data.deadline !== undefined) updates.deadline = parsed.data.deadline
    if (parsed.data.category !== undefined) updates.category = parsed.data.category
    if (parsed.data.linkedBankAccountId !== undefined) updates.linked_bank_account_id = parsed.data.linkedBankAccountId
    if (parsed.data.profileId !== undefined) updates.profile_id = parsed.data.profileId

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("savings_goals")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: "Failed to update savings goal" }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    console.error("[api/goals] PATCH Error:", err)
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
    const goal = await verifyGoalOwnership(supabase, accountId, id)
    if (!goal) {
      return NextResponse.json({ error: "Savings goal not found" }, { status: 404 })
    }

    const { error } = await supabase.from("savings_goals").delete().eq("id", id)
    if (error) return NextResponse.json({ error: "Failed to delete savings goal" }, { status: 500 })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error("[api/goals] DELETE Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
