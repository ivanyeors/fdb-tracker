import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { z } from "zod"

const profileSchema = z.object({
  name: z
    .string()
    .max(50)
    .optional()
    .default("")
    .transform((s) => (s?.trim()?.length ? s.trim() : "Person"))
    .pipe(z.string().min(1)),
  birth_year: z
    .number()
    .int()
    .min(1940)
    .max(2010)
    .nullable()
    .optional()
    .transform((v) => v ?? 1990),
})

const profilesSchema = z.object({
  mode: z.enum(["first-time", "new-family", "resume"]).optional().default("first-time"),
  familyId: z.string().uuid().optional(),
  profiles: z.array(profileSchema).min(1).max(6),
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
    const parsed = profilesSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", message: parsed.error.message },
        { status: 400 },
      )
    }

    const { mode, familyId: bodyFamilyId, profiles } = parsed.data
    const supabase = createSupabaseAdmin()
    const isNewFamily = mode === "new-family"

    let familyId: string

    if (bodyFamilyId) {
      const { data: fam } = await supabase
        .from("families")
        .select("id")
        .eq("id", bodyFamilyId)
        .eq("household_id", session.accountId)
        .single()
      if (!fam) {
        return NextResponse.json({ error: "Family not found" }, { status: 404 })
      }
      familyId = fam.id
    } else {
      const { data: existingFamily } = await supabase
        .from("families")
        .select("id")
        .eq("household_id", session.accountId)
        .order("created_at", { ascending: isNewFamily ? false : true })
        .limit(1)
        .single()
      if (!existingFamily) {
        return NextResponse.json(
          { error: "No family found. Complete users step first." },
          { status: 400 },
        )
      }
      familyId = existingFamily.id
    }

    const { data: existingProfiles } = await supabase
      .from("profiles")
      .select("id, name")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true })

    const existingNames = new Set(
      (existingProfiles ?? []).map((p) => p.name.toLowerCase().trim()),
    )
    const resolvedProfiles = profiles.map((p) => {
      const baseName = p.name.trim()
      const nameKey = baseName.toLowerCase()
      if (!existingNames.has(nameKey)) {
        existingNames.add(nameKey)
        return { ...p, name: baseName }
      }
      let suffix = 1
      let candidate: string
      do {
        candidate = `${baseName}-${suffix}`
        suffix++
      } while (existingNames.has(candidate.toLowerCase()))
      existingNames.add(candidate.toLowerCase())
      return { ...p, name: candidate }
    })

    let profileIds: string[]

    if (
      existingProfiles &&
      existingProfiles.length === resolvedProfiles.length &&
      !isNewFamily
    ) {
      for (let i = 0; i < resolvedProfiles.length; i++) {
        const p = resolvedProfiles[i]
        const existing = existingProfiles[i]
        if (existing) {
          await supabase
            .from("profiles")
            .update({ name: p.name, birth_year: p.birth_year })
            .eq("id", existing.id)
        }
      }
      profileIds = existingProfiles.map((p) => p.id)
    } else {
      if (existingProfiles && existingProfiles.length > 0 && !isNewFamily) {
        await supabase
          .from("profiles")
          .delete()
          .eq("family_id", familyId)
      }
      const { data: inserted, error: insertError } = await supabase
        .from("profiles")
        .insert(
          resolvedProfiles.map((p) => ({
            family_id: familyId,
            name: p.name,
            birth_year: p.birth_year,
          })),
        )
        .select("id")
      if (insertError) {
        console.error("Onboarding profiles insert error:", insertError)
        return NextResponse.json(
          { error: "Failed to save profiles" },
          { status: 500 },
        )
      }
      profileIds = (inserted ?? []).map((p) => p.id)
    }

    return NextResponse.json({
      success: true,
      familyId,
      profileIds,
    })
  } catch (error) {
    console.error("Onboarding profiles error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
