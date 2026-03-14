import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { getAge, calculateCpfContribution } from "@/lib/calculations/cpf"

const balancesQuerySchema = z.object({
  profileId: z.string().uuid(),
  months: z.string().regex(/^\d+$/).optional(),
})

const manualOverrideSchema = z.object({
  profileId: z.string().uuid(),
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
      profileId: searchParams.get("profileId"),
      months: searchParams.get("months") ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const profileId = parsed.data.profileId
    const monthCount = parsed.data.months ? parseInt(parsed.data.months, 10) : 12
    const supabase = createSupabaseAdmin()

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, birth_year")
      .eq("id", profileId)
      .eq("household_id", accountId)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const { data: balances } = await supabase
      .from("cpf_balances")
      .select("*")
      .eq("profile_id", profileId)
      .order("month", { ascending: false })
      .limit(monthCount)

    if (balances && balances.length > 0) {
      return NextResponse.json(balances.reverse())
    }

    const { data: incomeConfig } = await supabase
      .from("income_config")
      .select("annual_salary, bonus_estimate")
      .eq("profile_id", profileId)
      .single()

    if (!incomeConfig) {
      return NextResponse.json([])
    }

    const currentYear = new Date().getFullYear()
    const age = getAge(profile.birth_year, currentYear)
    const monthlyGross = incomeConfig.annual_salary / 12
    const contribution = calculateCpfContribution(monthlyGross, age, currentYear)

    const projectedBalances = []
    let runningOa = 0
    let runningSa = 0
    let runningMa = 0

    const now = new Date()

    for (let i = 0; i < monthCount; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1 - i), 1)
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, "0")
      const month = `${yyyy}-${mm}-01`

      runningOa += contribution.oa
      runningSa += contribution.sa
      runningMa += contribution.ma

      projectedBalances.push({
        profile_id: profileId,
        month,
        oa: Math.round(runningOa * 100) / 100,
        sa: Math.round(runningSa * 100) / 100,
        ma: Math.round(runningMa * 100) / 100,
        is_manual_override: false,
      })
    }

    return NextResponse.json(projectedBalances)
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

    const { profileId, month, oa, sa, ma } = parsed.data
    const supabase = createSupabaseAdmin()

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", profileId)
      .eq("household_id", accountId)
      .single()

    if (!profile) {
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
