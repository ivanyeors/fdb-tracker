import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import {
  decodeCpfHealthcareConfigPii,
  encodeCpfHealthcareConfigPiiPatch,
} from "@/lib/repos/cpf-healthcare-config"
import { decodeProfilePii } from "@/lib/repos/profiles"
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
        .select("id, name, name_enc, birth_year, birth_year_enc")
        .in("id", profileIds),
    ])

    const currentYear = new Date().getFullYear()

    const result = (profiles ?? []).map((rawProfile) => {
      const decoded = decodeProfilePii(rawProfile)
      const profile = {
        ...rawProfile,
        name: decoded.name ?? rawProfile.name,
        birth_year: decoded.birth_year ?? rawProfile.birth_year,
      }
      const config = configs?.find((c) => c.profile_id === profile.id)
      const age = getAge(profile.birth_year, currentYear)

      const decodedConfig = config ? decodeCpfHealthcareConfigPii(config) : null
      const mapped: CpfHealthcareConfig | null =
        config && decodedConfig
          ? {
              id: config.id,
              profileId: config.profile_id,
              mslAnnualOverride: decodedConfig.msl_annual_override,
              cslAnnual: decodedConfig.csl_annual ?? 0,
              cslSupplementAnnual: decodedConfig.csl_supplement_annual ?? 0,
              ispAnnual: decodedConfig.isp_annual ?? 0,
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

    const mslOverride = mslAnnualOverride ?? null
    const csl = cslAnnual ?? 0
    const cslSupp = cslSupplementAnnual ?? 0
    const isp = ispAnnual ?? 0
    const { data, error } = await supabase
      .from("cpf_healthcare_config")
      .upsert(
        {
          profile_id: profileId,
          ...encodeCpfHealthcareConfigPiiPatch({
            msl_annual_override: mslOverride,
            csl_annual: csl,
            csl_supplement_annual: cslSupp,
            isp_annual: isp,
          }),
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
