import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { decodeIncomeConfigPii } from "@/lib/repos/income-config"
import { decodeInsurancePoliciesPii } from "@/lib/repos/insurance-policies"
import { decodeProfilePii } from "@/lib/repos/profiles"
import { decodeTaxReliefInputsPii } from "@/lib/repos/tax-relief-inputs"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { calculateTax } from "@/lib/calculations/tax"

const calculateQuerySchema = z.object({
  profileId: z.string().uuid(),
  year: z.coerce.number().int().min(2020).max(2040).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = request.nextUrl
    const parsed = calculateQuerySchema.safeParse({
      profileId: searchParams.get("profileId"),
      year: searchParams.get("year") ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const { profileId, year } = parsed.data
    const taxYear = year ?? new Date().getFullYear()
    const supabase = createSupabaseAdmin()

    const resolved = await resolveFamilyAndProfiles(
      supabase,
      session.accountId,
      profileId,
      null
    )
    if (!resolved?.profileIds.includes(profileId)) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const { data: rawProfile } = await supabase
      .from("profiles")
      .select("id, birth_year, birth_year_enc")
      .eq("id", profileId)
      .single()

    if (!rawProfile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }
    const profile = {
      ...rawProfile,
      birth_year:
        decodeProfilePii(rawProfile).birth_year ?? rawProfile.birth_year,
    }

    const { data: incomeConfig } = await supabase
      .from("income_config")
      .select("annual_salary_enc, bonus_estimate_enc")
      .eq("profile_id", profileId)
      .single()
    const decodedIncome = incomeConfig
      ? decodeIncomeConfigPii(incomeConfig)
      : null

    const { data: insurancePolicies } = await supabase
      .from("insurance_policies")
      .select(
        "type, premium_amount_enc, frequency, coverage_amount_enc, is_active",
      )
      .eq("profile_id", profileId)

    const { data: manualReliefs } = await supabase
      .from("tax_relief_inputs")
      .select("relief_type, amount_enc")
      .eq("profile_id", profileId)
      .eq("year", taxYear)

    const result = calculateTax({
      profile: { birth_year: profile.birth_year },
      incomeConfig: decodedIncome
        ? {
            annual_salary: decodedIncome.annual_salary ?? 0,
            bonus_estimate: decodedIncome.bonus_estimate ?? 0,
          }
        : null,
      insurancePolicies: (insurancePolicies ?? []).map((p) => {
        const decoded = decodeInsurancePoliciesPii(p)
        return {
          type: p.type,
          premium_amount: decoded.premium_amount ?? 0,
          frequency: p.frequency,
          coverage_amount: decoded.coverage_amount ?? 0,
          is_active: p.is_active,
        }
      }),
      manualReliefs: (manualReliefs ?? []).map((r) => ({
        relief_type: r.relief_type,
        amount: decodeTaxReliefInputsPii(r).amount ?? 0,
      })),
      year: taxYear,
    })

    return NextResponse.json({
      calculatedAmount: result.taxPayable,
      chargeableIncome: result.chargeableIncome,
      reliefBreakdown: result.reliefBreakdown,
      effectiveRate: result.effectiveRate,
      employmentIncome: result.employmentIncome,
      totalReliefs: result.totalReliefs,
      reliefsRawTotal: result.reliefsRawTotal,
      reliefCapHeadroom: result.reliefCapHeadroom,
      taxBeforeRebate: result.taxBeforeRebate,
      rebateAmount: result.rebateAmount,
      marginalRate: result.marginalRate,
      marginalBandFrom: result.marginalBandFrom,
      marginalBandTo: result.marginalBandTo,
      bracketAllocation: result.bracketAllocation,
    })
  } catch (err) {
    console.error("[api/tax/calculate] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
