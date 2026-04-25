import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { encodeInsurancePoliciesPiiPatch } from "@/lib/repos/insurance-policies"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { getCoverageType, COVERAGE_TYPES } from "@/lib/insurance/coverage-config"
import { fetchInsurancePolicies } from "@/lib/api/insurance-data"

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

    const policies = await fetchInsurancePolicies(supabase, {
      profileIds: resolved.profileIds,
    })

    return NextResponse.json(policies)
  } catch (err) {
    console.error("[api/insurance] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

const coverageEntrySchema = z.object({
  coverageType: z.enum(COVERAGE_TYPES).nullable().optional(),
  benefitName: z.string().min(1).optional(),
  coverageAmount: z.number().min(0),
  benefitPremium: z.number().min(0).nullable().optional(),
  renewalBonus: z.number().min(0).nullable().optional(),
  benefitExpiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  benefitUnit: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
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
  inceptionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  cpfPremium: z.number().min(0).nullable().optional(),
  premiumWaiver: z.boolean().optional(),
  remarks: z.string().nullable().optional(),
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
    const firstStandard = coverages?.find((c) => c.coverageType)
    const legacyCoverageType = firstStandard
      ? firstStandard.coverageType
      : coverages && coverages.length > 0
        ? null
        : getCoverageType(parsed.data.type)
    const legacyCoverageAmount = firstStandard
      ? firstStandard.coverageAmount
      : coverages && coverages.length > 0
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
        ...encodeInsurancePoliciesPiiPatch({
          premium_amount: parsed.data.premiumAmount,
          coverage_amount: legacyCoverageAmount,
        }),
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
        inception_date: parsed.data.inceptionDate ?? null,
        cpf_premium: parsed.data.cpfPremium ?? null,
        premium_waiver: parsed.data.premiumWaiver ?? false,
        remarks: parsed.data.remarks ?? null,
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
          coverages.map((c, i) => ({
            policy_id: policy.id,
            coverage_type: c.coverageType ?? null,
            coverage_amount: c.coverageAmount,
            benefit_name: c.benefitName ?? null,
            benefit_premium: c.benefitPremium ?? null,
            renewal_bonus: c.renewalBonus ?? null,
            benefit_expiry_date: c.benefitExpiryDate ?? null,
            benefit_unit: c.benefitUnit ?? null,
            sort_order: c.sortOrder ?? i,
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
