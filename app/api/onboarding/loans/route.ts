import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { z } from "zod"

const loanSchema = z.object({
  name: z.string(),
  type: z.enum(["housing", "personal", "car", "education"]),
  principal: z.number().min(0).optional().default(0),
  rate_pct: z.number().min(0).optional().default(0),
  tenure_months: z.number().int().min(0).optional().default(0),
  start_date: z.string().optional().default(() => new Date().toISOString().slice(0, 10)),
  lender: z.string().optional(),
  use_cpf_oa: z.boolean().optional().default(false),
  profileIndex: z.number().int().min(0),
})

const loansRouteSchema = z.object({
  mode: z.enum(["first-time", "new-family", "resume"]).optional().default("first-time"),
  familyId: z.string().uuid().optional(),
  loans: z.array(loanSchema).optional().default([]),
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
    const parsed = loansRouteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", message: parsed.error.message },
        { status: 400 },
      )
    }

    const { familyId: bodyFamilyId, loans } = parsed.data
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

    for (const loan of loans) {
      const profileId = profiles[loan.profileIndex]?.id
      if (
        profileId &&
        loan.name.trim() &&
        loan.principal > 0 &&
        loan.tenure_months > 0
      ) {
        await supabase.from("loans").insert({
          profile_id: profileId,
          name: loan.name.trim(),
          type: loan.type,
          principal: loan.principal,
          rate_pct: loan.rate_pct,
          tenure_months: loan.tenure_months,
          start_date: loan.start_date,
          lender: loan.lender ?? null,
          use_cpf_oa: loan.use_cpf_oa,
        })
      }
    }

    return NextResponse.json({ success: true, familyId })
  } catch (error) {
    console.error("Onboarding loans error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
