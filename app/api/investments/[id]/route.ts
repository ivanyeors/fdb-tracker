import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const updateInvestmentSchema = z.object({
  symbol: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  units: z.number().min(0).optional(),
  costBasis: z.number().min(0).optional(),
  targetAllocationPct: z.number().min(0).max(100).nullable().optional(),
  profileId: z.string().uuid().nullable().optional(),
})

async function verifyInvestmentOwnership(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  resourceId: string
) {
  const { data: inv } = await supabase
    .from("investments")
    .select("id, family_id")
    .eq("id", resourceId)
    .single()
  if (!inv) return null
  const { data: family } = await supabase
    .from("families")
    .select("id")
    .eq("id", inv.family_id)
    .eq("household_id", accountId)
    .single()
  return family ? inv : null
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
    const inv = await verifyInvestmentOwnership(supabase, accountId, id)
    if (!inv) {
      return NextResponse.json({ error: "Investment not found" }, { status: 404 })
    }

    const body = await request.json()
    const parsed = updateInvestmentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (parsed.data.symbol !== undefined) updates.symbol = parsed.data.symbol
    if (parsed.data.type !== undefined) updates.type = parsed.data.type
    if (parsed.data.units !== undefined) updates.units = parsed.data.units
    if (parsed.data.costBasis !== undefined) updates.cost_basis = parsed.data.costBasis
    if (parsed.data.targetAllocationPct !== undefined) updates.target_allocation_pct = parsed.data.targetAllocationPct
    if (parsed.data.profileId !== undefined) updates.profile_id = parsed.data.profileId

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("investments")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: "Failed to update investment" }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    console.error("[api/investments] PATCH Error:", err)
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
    const inv = await verifyInvestmentOwnership(supabase, accountId, id)
    if (!inv) {
      return NextResponse.json({ error: "Investment not found" }, { status: 404 })
    }

    const { error } = await supabase.from("investments").delete().eq("id", id)
    if (error) return NextResponse.json({ error: "Failed to delete investment" }, { status: 500 })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error("[api/investments] DELETE Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
