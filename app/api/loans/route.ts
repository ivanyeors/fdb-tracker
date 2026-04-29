import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { decodeLoanPii, encodeLoanPiiPatch } from "@/lib/repos/loans"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"

const loansQuerySchema = z.object({
  profileId: z.uuid().optional(),
  familyId: z.uuid().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = request.nextUrl
    const parsed = loansQuerySchema.safeParse({
      profileId: searchParams.get("profileId") ?? undefined,
      familyId: searchParams.get("familyId") ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }
    if (!parsed.data.profileId && !parsed.data.familyId) {
      return NextResponse.json({ error: "profileId or familyId required" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      session.accountId,
      parsed.data.profileId ?? null,
      parsed.data.familyId ?? null
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }
    const { profileIds } = resolved

    // Include loans where user is the primary profile OR the split partner
    const profileIdList = profileIds.join(",")
    const { data: loans, error } = await supabase
      .from("loans")
      .select("*")
      .or(`profile_id.in.(${profileIdList}),split_profile_id.in.(${profileIdList})`)
      .order("created_at", { ascending: true })

    if (error) {
      return NextResponse.json({ error: "Failed to fetch loans" }, { status: 500 })
    }

    const decoded = (loans ?? []).map((l) => ({ ...l, ...decodeLoanPii(l) }))
    return NextResponse.json(decoded)
  } catch (err) {
    console.error("[api/loans] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

const createLoanSchema = z.object({
  profileId: z.uuid(),
  name: z.string().min(1),
  type: z.enum(["housing", "personal", "car", "education"]),
  principal: z.number().positive(),
  ratePct: z.number().min(0),
  tenureMonths: z.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lender: z.string().optional(),
  useCpfOa: z.boolean().optional(),
  valuationLimit: z.number().positive().optional().nullable(),
  // Split between couples
  splitProfileId: z.uuid().optional().nullable(),
  splitPct: z.number().min(0).max(100).optional(),
  // Rate increase
  rateIncreasePct: z.number().min(0).optional().nullable(),
  // Property type (HDB vs Private)
  propertyType: z.enum(["hdb", "private"]).optional().nullable(),
  // Private loan constraints
  lockInEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  earlyRepaymentPenaltyPct: z.number().min(0).optional().nullable(),
  maxAnnualPrepaymentPct: z.number().min(0).max(100).optional().nullable(),
})

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const body = await request.json()
    const parsed = createLoanSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      parsed.data.profileId,
      null
    )
    if (!resolved) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const { data: loan, error } = await supabase
      .from("loans")
      .insert({
        profile_id: parsed.data.profileId,
        name: parsed.data.name,
        type: parsed.data.type,
        principal: parsed.data.principal,
        rate_pct: parsed.data.ratePct,
        tenure_months: parsed.data.tenureMonths,
        start_date: parsed.data.startDate,
        lender: parsed.data.lender ?? null,
        ...encodeLoanPiiPatch({
          lender: parsed.data.lender ?? null,
          principal: parsed.data.principal,
        }),
        use_cpf_oa: parsed.data.useCpfOa ?? parsed.data.type === "housing",
        valuation_limit: parsed.data.valuationLimit ?? null,
        split_profile_id: parsed.data.splitProfileId ?? null,
        split_pct: parsed.data.splitPct ?? 100,
        rate_increase_pct: parsed.data.rateIncreasePct ?? null,
        property_type: parsed.data.propertyType ?? null,
        lock_in_end_date: parsed.data.lockInEndDate ?? null,
        early_repayment_penalty_pct: parsed.data.earlyRepaymentPenaltyPct ?? null,
        max_annual_prepayment_pct: parsed.data.maxAnnualPrepaymentPct ?? null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to create loan" }, { status: 500 })
    }
    return NextResponse.json({ ...loan, ...decodeLoanPii(loan) }, { status: 201 })
  } catch (err) {
    console.error("[api/loans] POST Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
