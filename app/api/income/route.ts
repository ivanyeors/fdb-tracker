import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { encodeIncomeConfigPiiPatch } from "@/lib/repos/income-config"
import { decodeProfilePii } from "@/lib/repos/profiles"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { getAge, getCpfRates } from "@/lib/calculations/cpf"

const incomeQuerySchema = z.object({
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
})

const incomeUpdateSchema = z.object({
  profileId: z.string().uuid(),
  familyId: z.string().uuid().optional(),
  annualSalary: z.number().min(0),
  bonusEstimate: z.number().min(0).optional(),
  payFrequency: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const { searchParams } = request.nextUrl
    const parsed = incomeQuerySchema.safeParse({
      profileId: searchParams.get("profileId") ?? undefined,
      familyId: searchParams.get("familyId") ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      parsed.data.profileId ?? null,
      parsed.data.familyId ?? null
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }
    if (resolved.profileIds.length !== 1) {
      return NextResponse.json(
        { error: "Income config requires a single profile (profileId or familyId with one member)" },
        { status: 400 }
      )
    }
    const profileId = resolved.profileIds[0]!

    const { data: incomeConfig, error } = await supabase
      .from("income_config")
      .select("*")
      .eq("profile_id", profileId)
      .single()

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: "Failed to fetch income config" }, { status: 500 })
    }

    return NextResponse.json(incomeConfig ?? null)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const body = await request.json()
    const parsed = incomeUpdateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const { profileId, familyId, annualSalary, bonusEstimate, payFrequency } = parsed.data
    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      profileId,
      familyId ?? null
    )
    if (!resolved || !resolved.profileIds.includes(profileId)) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const { data: rawProfile } = await supabase
      .from("profiles")
      .select("id, birth_year, birth_year_enc")
      .eq("id", profileId)
      .single()
    if (!rawProfile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }
    const profile = {
      ...rawProfile,
      birth_year:
        decodeProfilePii(rawProfile).birth_year ?? rawProfile.birth_year,
    }

    const currentYear = new Date().getFullYear()
    const age = getAge(profile.birth_year, currentYear)
    const cpfRates = getCpfRates(age, currentYear)

    const piiInput: { annual_salary?: number; bonus_estimate?: number } = {
      annual_salary: annualSalary,
    }
    if (bonusEstimate !== undefined) piiInput.bonus_estimate = bonusEstimate
    const { data, error } = await supabase
      .from("income_config")
      .upsert(
        {
          profile_id: profileId,
          annual_salary: annualSalary,
          ...(bonusEstimate !== undefined && { bonus_estimate: bonusEstimate }),
          ...encodeIncomeConfigPiiPatch(piiInput),
          ...(payFrequency !== undefined && { pay_frequency: payFrequency }),
          employee_cpf_rate: cpfRates.employeeRate,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" },
      )
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to update income config" }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
