import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { deriveMonthlyPremiumsFromGroupTotal } from "@/lib/investments/ilp-premium-derive"

const bodySchema = z.object({
  familyId: z.string().uuid(),
  totalInvested: z.number().min(0),
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

    // Persist total_invested on the group
    const { error: groupErr } = await supabase
      .from("ilp_fund_groups")
      .update({ total_invested: body.data.totalInvested })
      .eq("id", groupId)
      .eq("family_id", resolved.familyId)

    if (groupErr) {
      return NextResponse.json(
        { error: "Failed to update group total invested" },
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

    // Split total invested across products by allocation %
    const items = members.map((m) => ({
      productId: m.product_id,
      allocationPct: m.allocation_pct,
    }))
    const derived = deriveMonthlyPremiumsFromGroupTotal(
      body.data.totalInvested,
      items,
    )

    // Update each product's latest entry with the derived premiums_paid
    const breakdown: Array<{ productId: string; premiumsPaid: number }> = []
    const skipped: string[] = []

    for (const [productId, premiumsPaid] of derived) {
      const { data: latestEntry } = await supabase
        .from("ilp_entries")
        .select("product_id, month, fund_value")
        .eq("product_id", productId)
        .order("month", { ascending: false })
        .limit(1)
        .single()

      if (!latestEntry) {
        skipped.push(productId)
        continue
      }

      await supabase
        .from("ilp_entries")
        .upsert(
          {
            product_id: productId,
            month: latestEntry.month,
            fund_value: latestEntry.fund_value,
            premiums_paid: premiumsPaid,
          },
          { onConflict: "product_id,month" },
        )

      breakdown.push({ productId, premiumsPaid })
    }

    return NextResponse.json({
      updated: breakdown.length,
      breakdown,
      ...(skipped.length > 0 ? { skipped } : {}),
    })
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
