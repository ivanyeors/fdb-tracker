import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { encodeCpfBalancesPiiPatch } from "@/lib/repos/cpf-balances"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { z } from "zod"

const cpfBalanceSchema = z.object({
  profileIndex: z.number().int().min(0),
  oa: z.number().min(0).optional().default(0),
  sa: z.number().min(0).optional().default(0),
  ma: z.number().min(0).optional().default(0),
})

const cpfRouteSchema = z.object({
  mode: z.enum(["first-time", "new-family", "resume"]).optional().default("first-time"),
  familyId: z.string().uuid().optional(),
  cpfBalances: z.array(cpfBalanceSchema).optional().default([]),
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
    const parsed = cpfRouteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", message: parsed.error.message },
        { status: 400 },
      )
    }

    const { familyId: bodyFamilyId, cpfBalances } = parsed.data
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

    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`

    for (const cb of cpfBalances) {
      const profileId = profiles[cb.profileIndex]?.id
      if (profileId && (cb.oa > 0 || cb.sa > 0 || cb.ma > 0)) {
        await supabase.from("cpf_balances").upsert(
          {
            profile_id: profileId,
            month: currentMonth,
            ...encodeCpfBalancesPiiPatch({ oa: cb.oa, sa: cb.sa, ma: cb.ma }),
            is_manual_override: true,
          },
          { onConflict: "profile_id,month" },
        )
      }
    }

    return NextResponse.json({ success: true, familyId })
  } catch (error) {
    console.error("Onboarding cpf error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
