import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { rebalanceIlpFundGroupAfterProductDelete } from "@/lib/investments/ilp-rebalance-after-delete"

const updateIlpSchema = z.object({
  name: z.string().min(1).optional(),
  monthlyPremium: z.number().min(0).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  premiumPaymentMode: z.enum(["monthly", "one_time"]).optional(),
  profileId: z.string().uuid().nullable().optional(),
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
    .select("id, family_id, monthly_premium, premium_payment_mode")
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
    if (p.profileId !== undefined) updates.profile_id = p.profileId

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("ilp_products")
      .update(updates)
      .eq("id", id)
      .select("*")
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

    const resolvedFamilyId = product.family_id

    // Find all groups this product belongs to BEFORE deleting
    const { data: groupMemberships } = await supabase
      .from("ilp_fund_group_members")
      .select("fund_group_id")
      .eq("product_id", id)

    const affectedGroupIds = (groupMemberships ?? []).map((m) => m.fund_group_id)

    // Delete the product (CASCADE removes junction rows and entries)
    const { error } = await supabase.from("ilp_products").delete().eq("id", id)
    if (error) {
      return NextResponse.json({ error: "Failed to delete ILP product" }, { status: 500 })
    }

    // Rebalance all affected groups
    for (const groupId of affectedGroupIds) {
      const { error: rebalanceErr } = await rebalanceIlpFundGroupAfterProductDelete(
        supabase,
        resolvedFamilyId,
        groupId,
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
