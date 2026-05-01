import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { encodeTaxGiroSchedulePiiPatch } from "@/lib/repos/tax-giro-schedule"
import { encodeTaxNoaDataPiiPatch } from "@/lib/repos/tax-noa-data"
import { encodeTaxReliefInputsPiiPatch } from "@/lib/repos/tax-relief-inputs"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { calculateGiroSchedule } from "@/lib/calculations/tax-giro"

const noaReliefSchema = z.object({
  type: z.string(),
  label: z.string(),
  amount: z.number(),
})

const bracketLineSchema = z.object({
  label: z.string(),
  income: z.number(),
  rate: z.number().nullable(),
  tax: z.number(),
})

const importBodySchema = z.object({
  profile_id: z.uuid(),
  year: z.number().int().min(2020).max(2040),
  tax_payable: z.number().min(0),
  employment_income: z.number().nullable().optional(),
  chargeable_income: z.number().nullable().optional(),
  total_deductions: z.number().nullable().optional(),
  donations_deduction: z.number().nullable().optional(),
  reliefs_total: z.number().nullable().optional(),
  payment_due_date: z.string().nullable().optional(),
  reliefs: z.array(noaReliefSchema).optional().default([]),
  bracket_summary: z.array(bracketLineSchema).optional().default([]),
  is_on_giro: z.boolean().optional().default(false),
})

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const parsed = importBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: z.flattenError(parsed.error) },
        { status: 400 }
      )
    }

    const d = parsed.data
    const supabase = createSupabaseAdmin()

    // Verify profile belongs to household
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, family_id")
      .eq("id", d.profile_id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const { data: family } = await supabase
      .from("families")
      .select("id")
      .eq("id", profile.family_id)
      .eq("household_id", session.accountId)
      .single()

    if (!family) {
      return NextResponse.json(
        { error: "Profile not found or unauthorized" },
        { status: 404 }
      )
    }

    // 1. Upsert tax_entries with actual_amount from NOA
    const { data: existingEntry } = await supabase
      .from("tax_entries")
      .select("calculated_amount")
      .eq("profile_id", d.profile_id)
      .eq("year", d.year)
      .single()

    await supabase
      .from("tax_entries")
      .upsert(
        {
          profile_id: d.profile_id,
          year: d.year,
          calculated_amount: existingEntry?.calculated_amount ?? 0,
          actual_amount: d.tax_payable,
        },
        { onConflict: "profile_id,year" }
      )

    // 2. Store structured NOA data
    const noaPii = {
      employment_income: d.employment_income ?? null,
      chargeable_income: d.chargeable_income ?? null,
      total_deductions: d.total_deductions ?? null,
      donations_deduction: d.donations_deduction ?? null,
      reliefs_total: d.reliefs_total ?? null,
      tax_payable: d.tax_payable,
      reliefs_json: d.reliefs,
      bracket_summary_json: d.bracket_summary,
    }
    await supabase.from("tax_noa_data").upsert(
      {
        profile_id: d.profile_id,
        year: d.year,
        ...encodeTaxNoaDataPiiPatch(noaPii),
        payment_due_date: d.payment_due_date ?? null,
        is_on_giro: d.is_on_giro,
      },
      { onConflict: "profile_id,year" }
    )

    // 3. Auto-override reliefs from NOA data
    // If NOA has "Provident Fund/Life Insurance" amount, override CPF relief
    for (const relief of d.reliefs) {
      let reliefType: string | null = null
      if (relief.type === "cpf_life_insurance") reliefType = "cpf"
      else if (relief.type === "srs") reliefType = "srs"
      else if (relief.type === "nsman") reliefType = "nsman"

      if (reliefType && relief.amount > 0) {
        await supabase.from("tax_relief_inputs").upsert(
          {
            profile_id: d.profile_id,
            year: d.year,
            relief_type: reliefType,
            ...encodeTaxReliefInputsPiiPatch({ amount: relief.amount }),
          },
          { onConflict: "profile_id,year,relief_type" }
        )
      }
    }

    // 4. Auto-calculate GIRO schedule
    if (d.tax_payable > 0) {
      const giro = calculateGiroSchedule({
        taxPayable: d.tax_payable,
        year: d.year,
      })

      const giroPii = {
        schedule: giro.schedule,
        total_payable: giro.total,
        outstanding_balance: 0,
      }
      await supabase.from("tax_giro_schedule").upsert(
        {
          profile_id: d.profile_id,
          year: d.year,
          ...encodeTaxGiroSchedulePiiPatch(giroPii),
          source: "calculated",
        },
        { onConflict: "profile_id,year" }
      )
    }

    return NextResponse.json({
      success: true,
      year: d.year,
      tax_payable: d.tax_payable,
      reliefs_overridden: d.reliefs
        .filter((r) =>
          ["cpf_life_insurance", "srs", "nsman"].includes(r.type)
        )
        .map((r) => r.type),
    })
  } catch (err) {
    console.error("[api/tax/import] Error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
