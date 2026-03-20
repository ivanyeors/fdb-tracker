import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { getCoverageType } from "@/lib/insurance/coverage-config"
import { z } from "zod"

const onboardingInsuranceTypeEnum = z.enum([
  "term_life",
  "whole_life",
  "integrated_shield",
  "critical_illness",
  "endowment",
  "personal_accident",
])

const insuranceSchema = z.object({
  name: z.string(),
  type: onboardingInsuranceTypeEnum,
  premium_amount: z.number().min(0).optional().default(0),
  frequency: z.enum(["monthly", "yearly"]).optional().default("yearly"),
  coverage_amount: z.number().min(0).nullable().optional(),
  yearly_outflow_date: z.number().int().min(1).max(12).nullable().optional(),
  current_amount: z.number().min(0).nullable().optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  profileIndex: z.number().int().min(0),
})

const insuranceRouteSchema = z.object({
  mode: z.enum(["first-time", "new-family", "resume"]).optional().default("first-time"),
  familyId: z.string().uuid().optional(),
  insurancePolicies: z.array(insuranceSchema).optional().default([]),
})

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const parsed = insuranceRouteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", message: parsed.error.message },
        { status: 400 },
      )
    }

    const { familyId: bodyFamilyId, insurancePolicies } = parsed.data
    const supabase = createSupabaseAdmin()

    let familyId = bodyFamilyId
    if (!familyId) {
      const { data: fam } = await supabase
        .from("families")
        .select("id")
        .eq("household_id", session.accountId)
        .order("created_at", { ascending: true })
        .limit(1)
        .single()
      if (!fam) {
        return NextResponse.json(
          { error: "No family found. Complete users and profiles steps first." },
          { status: 400 },
        )
      }
      familyId = fam.id
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true })

    if (!profiles || profiles.length === 0) {
      return NextResponse.json(
        { error: "No profiles found. Complete profiles step first." },
        { status: 400 },
      )
    }

    for (const pol of insurancePolicies) {
      const profileId = profiles[pol.profileIndex]?.id
      if (profileId && pol.name.trim() && pol.premium_amount > 0) {
        const coverageType = getCoverageType(pol.type)
        await supabase.from("insurance_policies").insert({
          profile_id: profileId,
          name: pol.name.trim(),
          type: pol.type,
          premium_amount: pol.premium_amount,
          frequency: pol.frequency,
          coverage_amount: pol.coverage_amount ?? null,
          coverage_type: coverageType,
          yearly_outflow_date: pol.yearly_outflow_date ?? null,
          current_amount: pol.current_amount ?? null,
          end_date: pol.end_date ?? null,
          is_active: true,
          deduct_from_outflow: true,
        })
      }
    }

    return NextResponse.json({ success: true, familyId })
  } catch (error) {
    console.error("Onboarding insurance error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
