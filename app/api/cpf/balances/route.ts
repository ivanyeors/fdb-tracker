import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { getAge, calculateCpfContribution } from "@/lib/calculations/cpf"

const balancesQuerySchema = z.object({
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
  months: z.string().regex(/^\d+$/).optional(),
})

const manualOverrideSchema = z.object({
  profileId: z.string().uuid(),
  familyId: z.string().uuid().optional(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  oa: z.number().min(0),
  sa: z.number().min(0),
  ma: z.number().min(0),
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
    const parsed = balancesQuerySchema.safeParse({
      profileId: searchParams.get("profileId") ?? undefined,
      familyId: searchParams.get("familyId") ?? undefined,
      months: searchParams.get("months") ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const { profileId, familyId } = parsed.data
    const monthCount = parsed.data.months ? parseInt(parsed.data.months, 10) : 12
    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      profileId ?? null,
      familyId ?? null
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }
    const { profileIds } = resolved

    const { data: balances } = await supabase
      .from("cpf_balances")
      .select("*")
      .in("profile_id", profileIds)
      .order("month", { ascending: false })
      .limit(monthCount * profileIds.length)

    if (balances && balances.length > 0) {
      // Aggregate by month (sum OA, SA, MA across profiles) for consistent dashboard display
      const byMonth = new Map<
        string,
        { month: string; oa: number; sa: number; ma: number }
      >()
      for (const row of balances) {
        const month =
          typeof row.month === "string"
            ? row.month.slice(0, 10)
            : new Date(row.month).toISOString().slice(0, 10)
        const oa = Number(row.oa) || 0
        const sa = Number(row.sa) || 0
        const ma = Number(row.ma) || 0
        const existing = byMonth.get(month)
        if (existing) {
          existing.oa += oa
          existing.sa += sa
          existing.ma += ma
        } else {
          byMonth.set(month, { month, oa, sa, ma })
        }
      }
      const aggregated = Array.from(byMonth.values()).sort(
        (a, b) => new Date(a.month).getTime() - new Date(b.month).getTime(),
      )
      return NextResponse.json(aggregated)
    }

    // Project from income when no manual data - support single or multi-profile
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, birth_year")
      .in("id", profileIds)

    const { data: incomeConfigs } = await supabase
      .from("income_config")
      .select("profile_id, annual_salary, bonus_estimate")
      .in("profile_id", profileIds)

    const incomeByProfile = new Map(
      incomeConfigs?.map((ic) => [ic.profile_id, ic]) ?? [],
    )
    const profileById = new Map(profiles?.map((p) => [p.id, p]) ?? [])

    const now = new Date()
    const currentYear = now.getFullYear()
    const allProjected: Array<{
      profile_id: string
      month: string
      oa: number
      sa: number
      ma: number
      is_manual_override: boolean
    }> = []

    for (const pid of profileIds) {
      const profile = profileById.get(pid)
      const incomeConfig = incomeByProfile.get(pid)
      if (!profile || !incomeConfig || incomeConfig.annual_salary <= 0) continue

      const age = getAge(profile.birth_year, currentYear)
      const monthlyGross = incomeConfig.annual_salary / 12
      const contribution = calculateCpfContribution(
        monthlyGross,
        age,
        currentYear,
      )

      let runningOa = 0
      let runningSa = 0
      let runningMa = 0

      for (let i = 0; i < monthCount; i++) {
        const d = new Date(
          now.getFullYear(),
          now.getMonth() - (monthCount - 1 - i),
          1,
        )
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, "0")
        const month = `${yyyy}-${mm}-01`

        runningOa += contribution.oa
        runningSa += contribution.sa
        runningMa += contribution.ma

        allProjected.push({
          profile_id: pid,
          month,
          oa: Math.round(runningOa * 100) / 100,
          sa: Math.round(runningSa * 100) / 100,
          ma: Math.round(runningMa * 100) / 100,
          is_manual_override: false,
        })
      }
    }

    // Aggregate by month when multiple profiles (for CPF page charts)
    const byMonth = new Map<
      string,
      { month: string; oa: number; sa: number; ma: number }
    >()
    for (const p of allProjected) {
      const existing = byMonth.get(p.month)
      if (existing) {
        existing.oa += p.oa
        existing.sa += p.sa
        existing.ma += p.ma
      } else {
        byMonth.set(p.month, { month: p.month, oa: p.oa, sa: p.sa, ma: p.ma })
      }
    }
    const aggregated = Array.from(byMonth.values()).sort(
      (a, b) => new Date(a.month).getTime() - new Date(b.month).getTime(),
    )

    return NextResponse.json(aggregated)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const body = await request.json()
    const parsed = manualOverrideSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const { profileId, familyId, month, oa, sa, ma } = parsed.data
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

    const { data, error } = await supabase
      .from("cpf_balances")
      .upsert(
        {
          profile_id: profileId,
          month,
          oa,
          sa,
          ma,
          is_manual_override: true,
        },
        { onConflict: "profile_id,month" },
      )
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to save CPF balance" }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
