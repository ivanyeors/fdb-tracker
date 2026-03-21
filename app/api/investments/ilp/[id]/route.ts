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
import { rebalanceIlpFundGroupAfterProductDelete } from "@/lib/investments/ilp-rebalance-after-delete"

const updateIlpSchema = z.object({
  name: z.string().min(1).optional(),
  monthlyPremium: z.number().min(0).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Set to null to remove from group. */
  ilpFundGroupId: z.string().uuid().nullable().optional(),
  groupAllocationPct: z.number().min(0).max(100).nullable().optional(),
  premiumPaymentMode: z.enum(["monthly", "one_time"]).optional(),
})

async function verifyIlpOwnership(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  productId: string,
  familyId?: string | null,
) {
  const resolved = await resolveFamilyAndProfiles(
    supabase,
    accountId,
    null,
    familyId ?? null,
  )
  if (!resolved) return null

  const { data: product } = await supabase
    .from("ilp_products")
    .select(
      "id, family_id, ilp_fund_group_id, group_allocation_pct, monthly_premium, premium_payment_mode",
    )
    .eq("id", productId)
    .eq("family_id", resolved.familyId)
    .single()

  return product
}

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
    const { accountId } = session

    const { id } = await params
    const supabase = createSupabaseAdmin()

    const body = await request.json()
    const familyId = body.familyId as string | undefined
    const product = await verifyIlpOwnership(supabase, accountId, id, familyId)
    if (!product) {
      return NextResponse.json({ error: "ILP product not found" }, { status: 404 })
    }

    const parsed = updateIlpSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const p = parsed.data
    const ex = product

    /** Leave fund group */
    if (p.ilpFundGroupId === null) {
      if (ex.ilp_fund_group_id) {
        const { count: otherCount } = await supabase
          .from("ilp_products")
          .select("*", { count: "exact", head: true })
          .eq("ilp_fund_group_id", ex.ilp_fund_group_id)
          .eq("family_id", ex.family_id)
          .neq("id", id)

        if (otherCount && otherCount > 0) {
          return NextResponse.json(
            {
              error:
                "Cannot leave a fund group that still has other members. Update allocations with PATCH /api/investments/ilp/groups/{groupId}/allocations first.",
            },
            { status: 400 },
          )
        }
      }
    }

    /** Join a different fund group (must be empty, or use bulk allocations) */
    if (
      p.ilpFundGroupId != null &&
      p.ilpFundGroupId !== ex.ilp_fund_group_id
    ) {
      if (ex.ilp_fund_group_id) {
        const { count: otherInA } = await supabase
          .from("ilp_products")
          .select("*", { count: "exact", head: true })
          .eq("ilp_fund_group_id", ex.ilp_fund_group_id)
          .eq("family_id", ex.family_id)
          .neq("id", id)

        if (otherInA && otherInA > 0) {
          return NextResponse.json(
            {
              error:
                "Cannot move this product while other policies share its fund group. Use PATCH /api/investments/ilp/groups/{groupId}/allocations first.",
            },
            { status: 400 },
          )
        }
      }

      const { data: g2 } = await supabase
        .from("ilp_fund_groups")
        .select("id")
        .eq("id", p.ilpFundGroupId)
        .eq("family_id", ex.family_id)
        .maybeSingle()
      if (!g2) {
        return NextResponse.json({ error: "Fund group not found" }, { status: 400 })
      }

      const { count: inGroup } = await supabase
        .from("ilp_products")
        .select("*", { count: "exact", head: true })
        .eq("ilp_fund_group_id", p.ilpFundGroupId)
        .eq("family_id", ex.family_id)
        .neq("id", id)

      if (inGroup && inGroup > 0) {
        return NextResponse.json(
          {
            error:
              "Use PATCH /api/investments/ilp/groups/{groupId}/allocations to add a product to a fund group that already has members.",
          },
          { status: 400 },
        )
      }

      if (
        p.groupAllocationPct == null ||
        !isValidIlpGroupAllocationSum(p.groupAllocationPct)
      ) {
        return NextResponse.json(
          {
            error:
              "When joining an empty fund group, groupAllocationPct must be 100 (within rounding).",
          },
          { status: 400 },
        )
      }
    }

    if (
      p.groupAllocationPct === null &&
      p.groupAllocationPct !== undefined &&
      ex.ilp_fund_group_id &&
      (p.ilpFundGroupId === undefined || p.ilpFundGroupId === ex.ilp_fund_group_id)
    ) {
      return NextResponse.json(
        {
          error:
            "Cannot clear allocation while the product remains in a fund group. Leave the group first (you must be its only member).",
        },
        { status: 400 },
      )
    }

    /** Allocation % change while staying in the same group */
    if (
      p.groupAllocationPct !== undefined &&
      p.groupAllocationPct !== null &&
      ex.ilp_fund_group_id &&
      (p.ilpFundGroupId === undefined || p.ilpFundGroupId === ex.ilp_fund_group_id)
    ) {
      const { data: members } = await supabase
        .from("ilp_products")
        .select("id, group_allocation_pct")
        .eq("ilp_fund_group_id", ex.ilp_fund_group_id)
        .eq("family_id", ex.family_id)

      const others = (members ?? []).filter((m) => m.id !== id)
      const otherSum = sumAllocationPcts(
        others.map((m) => Number(m.group_allocation_pct ?? 0)),
      )
      const total = otherSum + p.groupAllocationPct
      if (!isValidIlpGroupAllocationSum(total)) {
        return NextResponse.json(
          { error: allocationSumMessage(total) },
          { status: 400 },
        )
      }
    }

    const afterMode =
      p.premiumPaymentMode ??
      (ex as { premium_payment_mode?: string }).premium_payment_mode ??
      "monthly"
    const afterPremium =
      p.monthlyPremium !== undefined
        ? p.monthlyPremium
        : Number((ex as { monthly_premium?: number }).monthly_premium ?? 0)
    if (afterMode === "monthly" && afterPremium <= 0) {
      return NextResponse.json(
        {
          error:
            "monthlyPremium must be positive when premium payment mode is monthly.",
        },
        { status: 400 },
      )
    }

    const updates: Record<string, unknown> = {}
    if (p.name !== undefined) updates.name = p.name
    if (p.monthlyPremium !== undefined) updates.monthly_premium = p.monthlyPremium
    if (p.endDate !== undefined) updates.end_date = p.endDate
    if (p.premiumPaymentMode !== undefined) {
      updates.premium_payment_mode = p.premiumPaymentMode
    }

    if (p.ilpFundGroupId !== undefined) {
      if (p.ilpFundGroupId === null) {
        updates.ilp_fund_group_id = null
        updates.group_allocation_pct = null
      } else {
        updates.ilp_fund_group_id = p.ilpFundGroupId
        if (p.ilpFundGroupId !== ex.ilp_fund_group_id) {
          updates.group_allocation_pct = p.groupAllocationPct ?? null
        } else if (p.groupAllocationPct !== undefined) {
          updates.group_allocation_pct = p.groupAllocationPct
        }
      }
    } else if (p.groupAllocationPct !== undefined) {
      updates.group_allocation_pct = p.groupAllocationPct
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("ilp_products")
      .update(updates)
      .eq("id", id)
      .select(
        "*, ilp_fund_groups ( id, name, group_premium_amount, premium_payment_mode )",
      )
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to update ILP product" }, { status: 500 })
    }
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const body = await request.json().catch(() => ({}))
    const familyId =
      typeof body === "object" &&
      body !== null &&
      "familyId" in body &&
      typeof (body as { familyId?: unknown }).familyId === "string"
        ? (body as { familyId: string }).familyId
        : undefined

    const { id } = await params
    const supabase = createSupabaseAdmin()

    const product = await verifyIlpOwnership(supabase, accountId, id, familyId)
    if (!product) {
      return NextResponse.json({ error: "ILP product not found" }, { status: 404 })
    }

    const fundGroupId = product.ilp_fund_group_id as string | null
    const resolvedFamilyId = product.family_id as string

    const { error } = await supabase.from("ilp_products").delete().eq("id", id)
    if (error) {
      return NextResponse.json({ error: "Failed to delete ILP product" }, { status: 500 })
    }

    if (fundGroupId) {
      const { error: rebalanceErr } = await rebalanceIlpFundGroupAfterProductDelete(
        supabase,
        resolvedFamilyId,
        fundGroupId,
      )
      if (rebalanceErr) {
        return NextResponse.json(
          { error: rebalanceErr },
          { status: 500 },
        )
      }
    }

    return new NextResponse(null, { status: 204 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
