import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { encodeIncomeConfigPiiPatch } from "@/lib/repos/income-config"
import { decodeProfilePii } from "@/lib/repos/profiles"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { calculateTax, solveBonusForTargetTaxPayable } from "@/lib/calculations/tax"

function roundToCent(value: number): number {
  return Math.round(value * 100) / 100
}

const postBodySchema = z.object({
  profile_id: z.string().uuid(),
  year: z.number().int().min(2020).max(2040),
  monthly_amount: z.number().min(0),
  payments_per_year: z.number().int().min(1).max(24).optional().default(12),
  sync_bonus_estimate: z.boolean().optional().default(true),
})

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const parsed = postBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const supabase = createSupabaseAdmin()

    const { data: rawProfile } = await supabase
      .from("profiles")
      .select("id, family_id, birth_year, birth_year_enc")
      .eq("id", parsed.data.profile_id)
      .single()

    if (!rawProfile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }
    const profile = {
      ...rawProfile,
      birth_year:
        decodeProfilePii(rawProfile).birth_year ?? rawProfile.birth_year,
    }

    const { data: family } = await supabase
      .from("families")
      .select("id")
      .eq("id", profile.family_id)
      .eq("household_id", session.accountId)
      .single()

    if (!family) {
      return NextResponse.json({ error: "Profile not found or unauthorized" }, { status: 404 })
    }

    const { data: incomeConfig, error: incomeError } = await supabase
      .from("income_config")
      .select("annual_salary, bonus_estimate")
      .eq("profile_id", parsed.data.profile_id)
      .single()

    if (incomeError || !incomeConfig) {
      return NextResponse.json(
        { error: "Income settings are required—add salary under Settings → Users first." },
        { status: 400 }
      )
    }

    const annualTax = roundToCent(parsed.data.monthly_amount * parsed.data.payments_per_year)

    const { data: insurancePolicies } = await supabase
      .from("insurance_policies")
      .select("type, premium_amount, frequency, coverage_amount, is_active")
      .eq("profile_id", parsed.data.profile_id)

    const { data: manualReliefs } = await supabase
      .from("tax_relief_inputs")
      .select("relief_type, amount")
      .eq("profile_id", parsed.data.profile_id)
      .eq("year", parsed.data.year)

    const insuranceMapped = (insurancePolicies ?? []).map((p) => ({
      type: p.type,
      premium_amount: p.premium_amount,
      frequency: p.frequency,
      coverage_amount: p.coverage_amount ?? 0,
      is_active: p.is_active,
    }))

    const manualMapped = (manualReliefs ?? []).map((r) => ({
      relief_type: r.relief_type,
      amount: r.amount,
    }))

    let bonusEstimate = Number(incomeConfig.bonus_estimate ?? 0)

    if (parsed.data.sync_bonus_estimate) {
      const solved = solveBonusForTargetTaxPayable({
        profile: { birth_year: profile.birth_year },
        annual_salary: Number(incomeConfig.annual_salary),
        insurancePolicies: insuranceMapped,
        manualReliefs: manualMapped,
        year: parsed.data.year,
        targetPayable: annualTax,
      })
      if (!solved.ok) {
        return NextResponse.json({ error: solved.error }, { status: 400 })
      }
      bonusEstimate = solved.bonus_estimate

      const { error: updateIncomeError } = await supabase
        .from("income_config")
        .update({
          bonus_estimate: bonusEstimate,
          ...encodeIncomeConfigPiiPatch({ bonus_estimate: bonusEstimate }),
        })
        .eq("profile_id", parsed.data.profile_id)

      if (updateIncomeError) {
        console.error("[api/tax/from-monthly] income_config update:", updateIncomeError)
        return NextResponse.json({ error: "Failed to update bonus estimate" }, { status: 500 })
      }
    }

    const result = calculateTax({
      profile: { birth_year: profile.birth_year },
      incomeConfig: {
        annual_salary: Number(incomeConfig.annual_salary),
        bonus_estimate: bonusEstimate,
      },
      insurancePolicies: insuranceMapped,
      manualReliefs: manualMapped,
      year: parsed.data.year,
    })

    const { data: updated, error: upsertError } = await supabase
      .from("tax_entries")
      .upsert(
        {
          profile_id: parsed.data.profile_id,
          year: parsed.data.year,
          calculated_amount: result.taxPayable,
          actual_amount: annualTax,
        },
        { onConflict: "profile_id,year" }
      )
      .select()
      .single()

    if (upsertError) {
      console.error("[api/tax/from-monthly] tax_entries upsert:", upsertError)
      return NextResponse.json({ error: "Failed to save tax entry" }, { status: 500 })
    }

    revalidatePath("/dashboard/tax")
    revalidatePath("/settings/users")

    return NextResponse.json({
      success: true,
      annual_tax: annualTax,
      bonus_estimate: bonusEstimate,
      calculated_amount: result.taxPayable,
      entry: updated,
    })
  } catch (err) {
    console.error("[api/tax/from-monthly] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
