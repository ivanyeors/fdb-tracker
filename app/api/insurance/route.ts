import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { getCoverageType, COVERAGE_TYPES } from "@/lib/insurance/coverage-config"

const insuranceQuerySchema = z.object({
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = request.nextUrl
    const parsed = insuranceQuerySchema.safeParse({
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

    const { data: policies, error } = await supabase
      .from("insurance_policies")
      .select("*, insurance_policy_coverages(id, coverage_type, coverage_amount)")
      .in("profile_id", profileIds)
      .order("created_at", { ascending: true })

    if (error) {
      return NextResponse.json({ error: "Failed to fetch policies" }, { status: 500 })
    }

    const mapped = (policies || []).map((p) => ({
      ...p,
      coverages: p.insurance_policy_coverages ?? [],
      insurance_policy_coverages: undefined,
    }))

    return NextResponse.json(mapped)
  } catch (err) {
    console.error("[api/insurance] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

const coverageEntrySchema = z.object({
  coverageType: z.enum(COVERAGE_TYPES),
  coverageAmount: z.number().min(0),
})

const createPolicySchema = z.object({
  profileId: z.string().uuid(),
  name: z.string().min(1),
  type: z.enum([
    "term_life",
    "whole_life",
    "universal_life",
    "integrated_shield",
    "critical_illness",
    "early_critical_illness",
    "multi_pay_ci",
    "endowment",
    "personal_accident",
    "disability_income",
    "long_term_care",
    "tpd",
  ]),
  premiumAmount: z.number().min(0),
  frequency: z.enum(["monthly", "yearly"]).optional(),
  coverageAmount: z.number().min(0).nullable().optional(),
  coverages: z.array(coverageEntrySchema).optional(),
  yearlyOutflowDate: z.number().int().min(1).max(12).nullable().optional(),
  currentAmount: z.number().min(0).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  subType: z.string().nullable().optional(),
  riderName: z.string().nullable().optional(),
  riderPremium: z.number().min(0).nullable().optional(),
  insurer: z.string().nullable().optional(),
  policyNumber: z.string().nullable().optional(),
  maturityValue: z.number().min(0).nullable().optional(),
  cashValue: z.number().min(0).nullable().optional(),
  coverageTillAge: z.number().int().min(1).nullable().optional(),
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
    const parsed = createPolicySchema.safeParse(body)
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

    const coverages = parsed.data.coverages
    const legacyCoverageType = coverages && coverages.length > 0
      ? coverages[0].coverageType
      : getCoverageType(parsed.data.type)
    const legacyCoverageAmount = coverages && coverages.length > 0
      ? coverages[0].coverageAmount
      : (parsed.data.coverageAmount ?? null)

    const { data: policy, error } = await supabase
      .from("insurance_policies")
      .insert({
        profile_id: parsed.data.profileId,
        name: parsed.data.name,
        type: parsed.data.type,
        premium_amount: parsed.data.premiumAmount,
        frequency: parsed.data.frequency ?? "yearly",
        coverage_amount: legacyCoverageAmount,
        coverage_type: legacyCoverageType,
        yearly_outflow_date: parsed.data.yearlyOutflowDate ?? null,
        current_amount: parsed.data.currentAmount ?? null,
        end_date: parsed.data.endDate ?? null,
        sub_type: parsed.data.subType ?? null,
        rider_name: parsed.data.riderName ?? null,
        rider_premium: parsed.data.riderPremium ?? null,
        insurer: parsed.data.insurer ?? null,
        policy_number: parsed.data.policyNumber ?? null,
        maturity_value: parsed.data.maturityValue ?? null,
        cash_value: parsed.data.cashValue ?? null,
        coverage_till_age: parsed.data.coverageTillAge ?? null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to create insurance policy" }, { status: 500 })
    }

    if (coverages && coverages.length > 0) {
      const { error: covError } = await supabase
        .from("insurance_policy_coverages")
        .insert(
          coverages.map((c) => ({
            policy_id: policy.id,
            coverage_type: c.coverageType,
            coverage_amount: c.coverageAmount,
          }))
        )
      if (covError) {
        console.error("[api/insurance] Failed to insert coverages:", covError)
      }
    } else if (legacyCoverageType) {
      await supabase.from("insurance_policy_coverages").insert({
        policy_id: policy.id,
        coverage_type: legacyCoverageType,
        coverage_amount: legacyCoverageAmount ?? 0,
      })
    }

    return NextResponse.json(policy, { status: 201 })
  } catch (err) {
    console.error("[api/insurance] POST Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
