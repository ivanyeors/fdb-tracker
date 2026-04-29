import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { z } from "zod"

const taxReliefSchema = z.object({
  relief_type: z.string(),
  amount: z.number().min(0).optional().default(0),
  profileIndex: z.number().int().min(0),
})

const taxReliefsRouteSchema = z.object({
  mode: z.enum(["first-time", "new-family", "resume"]).optional().default("first-time"),
  familyId: z.uuid().optional(),
  taxReliefInputs: z.array(taxReliefSchema).optional().default([]),
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
    const parsed = taxReliefsRouteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", message: parsed.error.message },
        { status: 400 },
      )
    }

    const { familyId: bodyFamilyId, taxReliefInputs } = parsed.data
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

    const currentYear = new Date().getFullYear()
    for (const rel of taxReliefInputs) {
      const profileId = profiles[rel.profileIndex]?.id
      if (profileId && rel.amount > 0) {
        await supabase.from("tax_relief_inputs").upsert(
          {
            profile_id: profileId,
            year: currentYear,
            relief_type: rel.relief_type,
            amount: rel.amount,
          },
          { onConflict: "profile_id,year,relief_type" },
        )
      }
    }

    return NextResponse.json({ success: true, familyId })
  } catch (error) {
    console.error("Onboarding tax-reliefs error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
