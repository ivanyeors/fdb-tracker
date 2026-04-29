import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import {
  allocationSumMessage,
  isValidIlpGroupAllocationSum,
  sumAllocationPcts,
} from "@/lib/investments/ilp-group-allocation"
import { deriveMonthlyPremiumsFromGroupTotal } from "@/lib/investments/ilp-premium-derive"

const bodySchema = z.object({
  familyId: z.uuid(),
  items: z
    .array(
      z.object({
        productId: z.uuid(),
        allocationPct: z.number().min(0).max(100),
      }),
    )
    .min(1),
  /** When set with premiumPaymentMode, updates group budget and per-product monthly_premium. */
  groupPremiumAmount: z.number().min(0).optional(),
  premiumPaymentMode: z.enum(["monthly", "one_time"]).optional(),
  /** Assign this group to a specific profile. */
  profileId: z.uuid().nullable().optional(),
})

/**
 * Atomically assigns all products in `items` to the group with the given
 * allocation percentages, and removes any previous members of the group not listed.
 * Products can belong to multiple groups (many-to-many via ilp_fund_group_members).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const { groupId } = await params
    const bodyRaw = await request.json()
    const parsed = bodySchema.safeParse(bodyRaw)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const { familyId, items, groupPremiumAmount, premiumPaymentMode } = parsed.data
    const sum = sumAllocationPcts(items.map((i) => i.allocationPct))
    if (!isValidIlpGroupAllocationSum(sum)) {
      return NextResponse.json(
        { error: allocationSumMessage(sum) },
        { status: 400 },
      )
    }

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      null,
      familyId,
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family not found" }, { status: 404 })
    }

    const { data: group, error: groupErr } = await supabase
      .from("ilp_fund_groups")
      .select("id, name")
      .eq("id", groupId)
      .eq("family_id", resolved.familyId)
      .maybeSingle()

    if (groupErr || !group) {
      return NextResponse.json({ error: "Fund group not found" }, { status: 404 })
    }

    const productIds = items.map((i) => i.productId)
    const uniqueIds = new Set(productIds)
    if (uniqueIds.size !== productIds.length) {
      return NextResponse.json(
        { error: "Duplicate product ids in allocation list" },
        { status: 400 },
      )
    }

    const { data: products, error: prodErr } = await supabase
      .from("ilp_products")
      .select("id, family_id")
      .in("id", productIds)
      .eq("family_id", resolved.familyId)

    if (prodErr || products?.length !== productIds.length) {
      return NextResponse.json(
        { error: "One or more ILP products not found in this family" },
        { status: 400 },
      )
    }

    // Remove members no longer in the list
    const { data: currentMembers } = await supabase
      .from("ilp_fund_group_members")
      .select("product_id")
      .eq("fund_group_id", groupId)

    const toRemove = (currentMembers ?? [])
      .map((m) => m.product_id)
      .filter((id) => !productIds.includes(id))

    if (toRemove.length > 0) {
      const { error: removeErr } = await supabase
        .from("ilp_fund_group_members")
        .delete()
        .eq("fund_group_id", groupId)
        .in("product_id", toRemove)

      if (removeErr) {
        return NextResponse.json(
          { error: "Failed to update group membership" },
          { status: 500 },
        )
      }
    }

    // Upsert memberships
    for (const row of items) {
      const { error: upErr } = await supabase
        .from("ilp_fund_group_members")
        .upsert(
          {
            fund_group_id: groupId,
            product_id: row.productId,
            allocation_pct: row.allocationPct,
          },
          { onConflict: "fund_group_id,product_id" },
        )

      if (upErr) {
        return NextResponse.json(
          { error: "Failed to set allocation" },
          { status: 500 },
        )
      }
    }

    // Update group premium if provided
    // Update profile assignment if provided
    if (parsed.data.profileId !== undefined) {
      await supabase
        .from("ilp_fund_groups")
        .update({ profile_id: parsed.data.profileId })
        .eq("id", groupId)
        .eq("family_id", resolved.familyId)
    }

    if (
      groupPremiumAmount !== undefined &&
      premiumPaymentMode !== undefined
    ) {
      const { error: gErr } = await supabase
        .from("ilp_fund_groups")
        .update({
          group_premium_amount: groupPremiumAmount,
          premium_payment_mode: premiumPaymentMode,
        })
        .eq("id", groupId)
        .eq("family_id", resolved.familyId)

      if (gErr) {
        return NextResponse.json(
          { error: "Failed to update group premium" },
          { status: 500 },
        )
      }

      if (premiumPaymentMode === "one_time") {
        for (const row of items) {
          const { error: u2 } = await supabase
            .from("ilp_products")
            .update({
              monthly_premium: 0,
              premium_payment_mode: "one_time",
            })
            .eq("id", row.productId)
            .eq("family_id", resolved.familyId)
          if (u2) {
            return NextResponse.json(
              { error: "Failed to set one-time premium mode" },
              { status: 500 },
            )
          }
        }
      } else {
        const derived = deriveMonthlyPremiumsFromGroupTotal(groupPremiumAmount, items)
        for (const row of items) {
          const mp = derived.get(row.productId) ?? 0
          const { error: u2 } = await supabase
            .from("ilp_products")
            .update({
              monthly_premium: mp,
              premium_payment_mode: "monthly",
            })
            .eq("id", row.productId)
            .eq("family_id", resolved.familyId)
          if (u2) {
            return NextResponse.json(
              { error: "Failed to derive monthly premiums" },
              { status: 500 },
            )
          }
        }
      }
    }

    // Fetch updated products with their membership info for this group
    const { data: members, error: memErr } = await supabase
      .from("ilp_fund_group_members")
      .select("product_id, allocation_pct")
      .eq("fund_group_id", groupId)

    if (memErr) {
      return NextResponse.json({ error: "Failed to load updated products" }, { status: 500 })
    }

    const memberProductIds = (members ?? []).map((m) => m.product_id)
    if (memberProductIds.length === 0) {
      return NextResponse.json({ products: [] })
    }

    const { data: updatedProducts, error: fetchErr } = await supabase
      .from("ilp_products")
      .select("*")
      .in("id", memberProductIds)
      .eq("family_id", resolved.familyId)
      .order("created_at", { ascending: true })

    if (fetchErr) {
      return NextResponse.json({ error: "Failed to load updated products" }, { status: 500 })
    }

    const memberMap = new Map(
      (members ?? []).map((m) => [m.product_id, m.allocation_pct]),
    )

    const result = (updatedProducts ?? []).map((p) => ({
      ...p,
      group_allocation_pct: memberMap.get(p.id) ?? 0,
      ilp_fund_groups: { id: groupId, name: group.name },
    }))

    return NextResponse.json({ products: result })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
