import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { getCoverageType, COVERAGE_TYPES } from "@/lib/insurance/coverage-config"

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

const updatePolicySchema = z.object({
  name: z.string().min(1).optional(),
  type: z
    .enum([
      "term_life",
      "whole_life",
      "universal_life",
      "integrated_shield",
      "critical_illness",
      "early_critical_illness",
      "multi_pay_ci",
      "endowment",
      "ilp",
      "personal_accident",
      "disability_income",
      "long_term_care",
      "tpd",
    ])
    .optional(),
  premiumAmount: z.number().min(0).optional(),
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
  isActive: z.boolean().optional(),
  deductFromOutflow: z.boolean().optional(),
})

async function verifyPolicyOwnership(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  resourceId: string
) {
  const { data: policy } = await supabase
    .from("insurance_policies")
    .select("id, profile_id")
    .eq("id", resourceId)
    .single()
  if (!policy) return null
  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", policy.profile_id)
    .single()
  if (!profile) return null
  const { data: family } = await supabase
    .from("families")
    .select("id")
    .eq("id", profile.family_id)
    .eq("household_id", accountId)
    .single()
  return family ? policy : null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const policy = await verifyPolicyOwnership(supabase, accountId, id)
    if (!policy) {
      return NextResponse.json({ error: "Insurance policy not found" }, { status: 404 })
    }

    const body = await request.json()
    const parsed = updatePolicySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (parsed.data.name !== undefined) updates.name = parsed.data.name
    if (parsed.data.type !== undefined) {
      updates.type = parsed.data.type
      updates.coverage_type = getCoverageType(parsed.data.type)
    }
    if (parsed.data.premiumAmount !== undefined) updates.premium_amount = parsed.data.premiumAmount
    if (parsed.data.frequency !== undefined) updates.frequency = parsed.data.frequency
    if (parsed.data.coverageAmount !== undefined) updates.coverage_amount = parsed.data.coverageAmount
    if (parsed.data.yearlyOutflowDate !== undefined)
      updates.yearly_outflow_date = parsed.data.yearlyOutflowDate
    if (parsed.data.currentAmount !== undefined) updates.current_amount = parsed.data.currentAmount
    if (parsed.data.endDate !== undefined) updates.end_date = parsed.data.endDate
    if (parsed.data.subType !== undefined) updates.sub_type = parsed.data.subType
    if (parsed.data.riderName !== undefined) updates.rider_name = parsed.data.riderName
    if (parsed.data.riderPremium !== undefined) updates.rider_premium = parsed.data.riderPremium
    if (parsed.data.insurer !== undefined) updates.insurer = parsed.data.insurer
    if (parsed.data.policyNumber !== undefined) updates.policy_number = parsed.data.policyNumber
    if (parsed.data.maturityValue !== undefined) updates.maturity_value = parsed.data.maturityValue
    if (parsed.data.cashValue !== undefined) updates.cash_value = parsed.data.cashValue
    if (parsed.data.coverageTillAge !== undefined) updates.coverage_till_age = parsed.data.coverageTillAge
    if (parsed.data.inceptionDate !== undefined) updates.inception_date = parsed.data.inceptionDate
    if (parsed.data.cpfPremium !== undefined) updates.cpf_premium = parsed.data.cpfPremium
    if (parsed.data.premiumWaiver !== undefined) updates.premium_waiver = parsed.data.premiumWaiver
    if (parsed.data.remarks !== undefined) updates.remarks = parsed.data.remarks
    if (parsed.data.isActive !== undefined) updates.is_active = parsed.data.isActive
    if (parsed.data.deductFromOutflow !== undefined) updates.deduct_from_outflow = parsed.data.deductFromOutflow

    const coverages = parsed.data.coverages

    if (coverages !== undefined) {
      const firstStandard = coverages.find((c) => c.coverageType)
      if (firstStandard) {
        updates.coverage_type = firstStandard.coverageType
        updates.coverage_amount = firstStandard.coverageAmount
      } else if (coverages.length > 0) {
        updates.coverage_type = null
        updates.coverage_amount = coverages[0].coverageAmount
      } else {
        updates.coverage_type = null
        updates.coverage_amount = null
      }
    }

    if (Object.keys(updates).length === 0 && coverages === undefined) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("insurance_policies")
        .update(updates)
        .eq("id", id)

      if (error) return NextResponse.json({ error: "Failed to update insurance policy" }, { status: 500 })
    }

    if (coverages !== undefined) {
      await supabase
        .from("insurance_policy_coverages")
        .delete()
        .eq("policy_id", id)

      if (coverages.length > 0) {
        const { error: covError } = await supabase
          .from("insurance_policy_coverages")
          .insert(
            coverages.map((c, i) => ({
              policy_id: id,
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
          console.error("[api/insurance] Failed to update coverages:", covError)
        }
      }
    }

    const { data, error: fetchError } = await supabase
      .from("insurance_policies")
      .select("*, insurance_policy_coverages(id, coverage_type, coverage_amount, benefit_name, benefit_premium, renewal_bonus, benefit_expiry_date, benefit_unit, sort_order)")
      .eq("id", id)
      .single()

    if (fetchError) return NextResponse.json({ error: "Failed to fetch updated policy" }, { status: 500 })

    const result = {
      ...data,
      coverages: data.insurance_policy_coverages ?? [],
      insurance_policy_coverages: undefined,
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error("[api/insurance] PATCH Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const policy = await verifyPolicyOwnership(supabase, accountId, id)
    if (!policy) {
      return NextResponse.json({ error: "Insurance policy not found" }, { status: 404 })
    }

    const { error } = await supabase.from("insurance_policies").delete().eq("id", id)
    if (error) return NextResponse.json({ error: "Failed to delete insurance policy" }, { status: 500 })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error("[api/insurance] DELETE Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
