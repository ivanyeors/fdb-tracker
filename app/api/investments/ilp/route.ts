import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { fetchIlpProducts } from "@/lib/api/ilp-data"

const ilpQuerySchema = z.object({
  profileId: z.uuid().optional(),
  familyId: z.uuid().optional(),
})

const createIlpSchema = z
  .object({
    name: z.string().min(1),
    monthlyPremium: z.number().min(0),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    profileId: z.uuid().optional(),
    familyId: z.uuid().optional(),
    premiumPaymentMode: z.enum(["monthly", "one_time"]).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .superRefine((data, ctx) => {
    const mode = data.premiumPaymentMode ?? "monthly"
    if (mode === "monthly" && data.monthlyPremium <= 0) {
      ctx.addIssue({
        code: "custom",
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
    const result = await fetchIlpProducts(supabase, {
      familyId: resolved.familyId,
      profileId: parsed.data.profileId ?? null,
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
