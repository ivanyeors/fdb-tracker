import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { encodeIncomeConfigPiiPatch } from "@/lib/repos/income-config"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { z } from "zod"

const incomeSchema = z.object({
  annual_salary: z.number().min(0).nullable().optional().default(0),
  bonus_estimate: z.number().min(0).nullable().optional().default(0),
  pay_frequency: z
    .enum(["monthly", "bi-monthly", "weekly"])
    .optional()
    .default("monthly"),
})

const incomeRouteSchema = z.object({
  mode: z.enum(["first-time", "new-family", "resume"]).optional().default("first-time"),
  familyId: z.string().uuid().optional(),
  incomeConfigs: z.array(incomeSchema).min(1).max(6),
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
    const parsed = incomeRouteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", message: parsed.error.message },
        { status: 400 },
      )
    }

    const { familyId: bodyFamilyId, incomeConfigs } = parsed.data
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

    const inserts = incomeConfigs
      .slice(0, profiles.length)
      .map((ic, idx) => {
        const annualSalary = ic.annual_salary ?? 0
        const bonusEstimate = ic.bonus_estimate ?? 0
        return {
          profile_id: profiles[idx].id,
          ...encodeIncomeConfigPiiPatch({
            annual_salary: annualSalary,
            bonus_estimate: bonusEstimate,
          }),
          pay_frequency: ic.pay_frequency,
        }
      })

    const { error } = await supabase
      .from("income_config")
      .upsert(inserts, { onConflict: "profile_id" })

    if (error) {
      console.error("Onboarding income error:", error)
      return NextResponse.json(
        { error: "Failed to save income config" },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, familyId })
  } catch (error) {
    console.error("Onboarding income error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
