import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { deriveMonthlyPremiumsFromGroupTotal } from "@/lib/investments/ilp-premium-derive"

const bodySchema = z.object({
  familyId: z.uuid(),
  monthlyTotal: z.number().min(0),
  profileId: z.uuid().nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { groupId } = await params
    const body = bodySchema.safeParse(await request.json())
    if (!body.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      session.accountId,
      null,
      body.data.familyId,
    )
    if (!resolved)
      return NextResponse.json({ error: "Family not found" }, { status: 404 })

    // Update group premium amount (and profile_id if provided)
    const updatePayload: Record<string, unknown> = {
      group_premium_amount: body.data.monthlyTotal,
    }
    if (body.data.profileId !== undefined) {
      updatePayload.profile_id = body.data.profileId
    }
    const { error: groupErr } = await supabase
      .from("ilp_fund_groups")
      .update(updatePayload)
      .eq("id", groupId)
      .eq("family_id", resolved.familyId)

    if (groupErr) {
      return NextResponse.json(
        { error: "Failed to update group premium" },
        { status: 500 },
      )
    }

    // Fetch current members with allocations
    const { data: members } = await supabase
      .from("ilp_fund_group_members")
      .select("id, product_id, allocation_pct")
      .eq("fund_group_id", groupId)

    if (!members || members.length === 0) {
      return NextResponse.json({ updated: 0, breakdown: [] })
    }

    // Derive individual premiums
    const items = members.map((m) => ({
      productId: m.product_id,
      allocationPct: m.allocation_pct,
    }))
    const derived = deriveMonthlyPremiumsFromGroupTotal(
      body.data.monthlyTotal,
      items,
    )

    // Update each product's monthly_premium
    const breakdown: Array<{ productId: string; monthlyPremium: number }> = []
    for (const [productId, premium] of derived) {
      await supabase
        .from("ilp_products")
        .update({ monthly_premium: premium })
        .eq("id", productId)
      breakdown.push({ productId, monthlyPremium: premium })
    }

    return NextResponse.json({ updated: breakdown.length, breakdown })
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
