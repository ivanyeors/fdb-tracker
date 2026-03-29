import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"

const ilpQuerySchema = z.object({
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
})

const createIlpSchema = z
  .object({
    name: z.string().min(1),
    monthlyPremium: z.number().min(0),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    profileId: z.string().uuid().optional(),
    familyId: z.string().uuid().optional(),
    premiumPaymentMode: z.enum(["monthly", "one_time"]).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .superRefine((data, ctx) => {
    const mode = data.premiumPaymentMode ?? "monthly"
    if (mode === "monthly" && data.monthlyPremium <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "monthlyPremium must be positive when premiumPaymentMode is monthly.",
        path: ["monthlyPremium"],
      })
    }
  })

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const { searchParams } = request.nextUrl
    const parsed = ilpQuerySchema.safeParse({
      profileId: searchParams.get("profileId") ?? undefined,
      familyId: searchParams.get("familyId") ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      parsed.data.profileId ?? null,
      parsed.data.familyId ?? null
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }
    const { familyId } = resolved
    const requestedProfileId = parsed.data.profileId ?? null

    let query = supabase
      .from("ilp_products")
      .select("*")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true })

    if (requestedProfileId) {
      query = query.or(
        `profile_id.eq.${requestedProfileId},profile_id.is.null`,
      )
    }

    const { data: products, error } = await query

    if (error) {
      return NextResponse.json({ error: "Failed to fetch ILP products" }, { status: 500 })
    }

    if (!products || products.length === 0) {
      return NextResponse.json([])
    }

    const productIds = products.map((p) => p.id)

    // Fetch fund group memberships for all products
    const { data: memberships } = await supabase
      .from("ilp_fund_group_members")
      .select("id, fund_group_id, product_id, allocation_pct, ilp_fund_groups ( id, name, group_premium_amount, premium_payment_mode )")
      .in("product_id", productIds)

    // Build a map: productId -> array of memberships
    const membershipsByProduct = new Map<string, typeof memberships>()
    for (const m of memberships ?? []) {
      const list = membershipsByProduct.get(m.product_id) ?? []
      list.push(m)
      membershipsByProduct.set(m.product_id, list)
    }

    const { data: allEntries, error: entriesError } = await supabase
      .from("ilp_entries")
      .select("*")
      .in("product_id", productIds)
      .order("month", { ascending: false })

    if (entriesError) {
      return NextResponse.json({ error: "Failed to fetch ILP entries" }, { status: 500 })
    }

    const latestEntryByProduct = new Map<string, (typeof allEntries)[number]>()
    const entriesByProduct = new Map<string, (typeof allEntries)[number][]>()
    for (const entry of allEntries) {
      if (!latestEntryByProduct.has(entry.product_id)) {
        latestEntryByProduct.set(entry.product_id, entry)
      }
      const list = entriesByProduct.get(entry.product_id) ?? []
      list.push(entry)
      entriesByProduct.set(entry.product_id, list)
    }

    const result = products.map((product) => {
      const entries = (entriesByProduct.get(product.id) ?? []).sort(
        (a, b) => a.month.localeCompare(b.month),
      )
      const productMemberships = membershipsByProduct.get(product.id) ?? []
      const fundGroupMemberships = productMemberships.map((m) => {
        const g = m.ilp_fund_groups as unknown as {
          id: string
          name: string
          group_premium_amount: number | null
          premium_payment_mode: string
        } | null
        return {
          id: m.id,
          group_id: g?.id ?? m.fund_group_id,
          group_name: g?.name ?? "",
          allocation_pct: Number(m.allocation_pct),
          group_premium_amount: g?.group_premium_amount ?? null,
          premium_payment_mode: g?.premium_payment_mode ?? "monthly",
        }
      })

      return {
        ...product,
        fund_group_memberships: fundGroupMemberships,
        latestEntry: latestEntryByProduct.get(product.id) ?? null,
        entries: entries.map((e) => ({
          month: e.month,
          fund_value: e.fund_value,
          premiums_paid: e.premiums_paid ?? null,
          fund_report_snapshot: e.fund_report_snapshot ?? null,
        })),
      }
    })

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const body = await request.json()
    const parsed = createIlpSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const {
      name,
      monthlyPremium,
      endDate,
      profileId,
      familyId,
      premiumPaymentMode,
      startDate,
    } = parsed.data
    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      profileId ?? null,
      familyId ?? null
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }
    if (profileId && !resolved.profileIds.includes(profileId)) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const { data, error } = await supabase
      .from("ilp_products")
      .insert({
        family_id: resolved.familyId,
        name,
        monthly_premium: monthlyPremium,
        end_date: endDate,
        premium_payment_mode: premiumPaymentMode ?? "monthly",
        ...(profileId && { profile_id: profileId }),
        ...(startDate && { start_date: startDate }),
      })
      .select("*")
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to create ILP product" }, { status: 500 })
    }

    return NextResponse.json({ ...data, fund_group_memberships: [] }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
