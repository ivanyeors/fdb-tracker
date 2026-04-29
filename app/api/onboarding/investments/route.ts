import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { calculateWeightedAverageCost } from "@/lib/calculations/investments"
import { z } from "zod"

const investmentSchema = z.object({
  type: z.enum(["stock", "gold", "silver", "ilp", "etf", "bond"]),
  symbol: z.string(),
  units: z.number().min(0).optional().default(0),
  cost_basis: z.number().min(0).optional().default(0),
  profileIndex: z.number().int().min(0),
})

const investmentsRouteSchema = z.object({
  mode: z.enum(["first-time", "new-family", "resume"]).optional().default("first-time"),
  familyId: z.uuid().optional(),
  investments: z.array(investmentSchema).optional().default([]),
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
    const parsed = investmentsRouteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", message: parsed.error.message },
        { status: 400 },
      )
    }

    const { familyId: bodyFamilyId, investments } = parsed.data
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

    for (const inv of investments) {
      const profileId = profiles[inv.profileIndex]?.id
      const symbol = inv.symbol.trim()
      if (!profileId || !symbol || inv.units <= 0) continue

      const { data: existingRows } = await supabase
        .from("investments")
        .select("id, units, cost_basis")
        .eq("family_id", familyId)
        .eq("profile_id", profileId)
        .eq("symbol", symbol)
        .eq("type", inv.type)
        .order("created_at", { ascending: true })
        .limit(1)
      const existing = existingRows?.[0] ?? null

      if (existing) {
        const mergedCost = calculateWeightedAverageCost(
          existing.units,
          existing.cost_basis,
          inv.units,
          inv.cost_basis,
        )
        await supabase
          .from("investments")
          .update({
            units: existing.units + inv.units,
            cost_basis: mergedCost,
          })
          .eq("id", existing.id)
      } else {
        await supabase.from("investments").insert({
          family_id: familyId,
          profile_id: profileId,
          type: inv.type,
          symbol,
          units: inv.units,
          cost_basis: inv.cost_basis,
        })
      }
    }

    return NextResponse.json({ success: true, familyId })
  } catch (error) {
    console.error("Onboarding investments error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
