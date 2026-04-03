import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { getAge } from "@/lib/calculations/cpf"
import {
  getAnnualHealthcareMaDeduction,
  type CpfHealthcareConfig,
} from "@/lib/calculations/cpf-healthcare"

const querySchema = z.object({
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
})

const upsertSchema = z.object({
  profileId: z.string().uuid(),
  mslAnnualOverride: z.number().min(0).nullable().optional(),
  cslAnnual: z.number().min(0).optional(),
  cslSupplementAnnual: z.number().min(0).optional(),
  ispAnnual: z.number().min(0).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const { searchParams } = request.nextUrl
    const parsed = querySchema.safeParse({
      profileId: searchParams.get("profileId") ?? undefined,
      familyId: searchParams.get("familyId") ?? undefined,
    })
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid query parameters" },
        { status: 400 },
      )

    const { profileId, familyId } = parsed.data
    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      profileId ?? null,
      familyId ?? null,
    )
    if (!resolved)
      return NextResponse.json(
        { error: "Family or profile not found" },
        { status: 404 },
      )

    const { profileIds } = resolved

    // Fetch healthcare config + profile birth_year for each profile
    const [{ data: configs }, { data: profiles }] = await Promise.all([
      supabase
        .from("cpf_healthcare_config")
        .select("*")
        .in("profile_id", profileIds),
      supabase
        .from("profiles")
        .select("id, name, birth_year")
        .in("id", profileIds),
    ])

    const currentYear = new Date().getFullYear()

    const result = (profiles ?? []).map((profile) => {
      const config = configs?.find((c) => c.profile_id === profile.id)
      const age = getAge(profile.birth_year, currentYear)

      const mapped: CpfHealthcareConfig | null = config
        ? {
            id: config.id,
            profileId: config.profile_id,
            mslAnnualOverride:
              config.msl_annual_override != null
                ? Number(config.msl_annual_override)
                : null,
            cslAnnual: Number(config.csl_annual),
            cslSupplementAnnual: Number(config.csl_supplement_annual),
            ispAnnual: Number(config.isp_annual),
          }
        : null

      const breakdown = getAnnualHealthcareMaDeduction(age, mapped)

      return {
        profileId: profile.id,
        profileName: profile.name,
        age,
        config: mapped,
        breakdown,
      }
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error("[api/cpf/healthcare] GET error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const body = await request.json()
    const parsed = upsertSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })

    const {
      profileId,
      mslAnnualOverride,
      cslAnnual,
      cslSupplementAnnual,
      ispAnnual,
    } = parsed.data

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      profileId,
      null,
    )
    if (!resolved || !resolved.profileIds.includes(profileId))
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 },
      )

    const { data, error } = await supabase
      .from("cpf_healthcare_config")
      .upsert(
        {
          profile_id: profileId,
          msl_annual_override: mslAnnualOverride ?? null,
          csl_annual: cslAnnual ?? 0,
          csl_supplement_annual: cslSupplementAnnual ?? 0,
          isp_annual: ispAnnual ?? 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" },
      )
      .select()
      .single()

    if (error) {
      console.error("[api/cpf/healthcare] Upsert error:", error)
      return NextResponse.json(
        { error: "Failed to save healthcare config" },
        { status: 500 },
      )
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error("[api/cpf/healthcare] POST error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
