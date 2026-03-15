import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { getEffectiveOutflowForProfile } from "@/lib/api/effective-outflow"
import { getEffectiveInflowForProfile } from "@/lib/api/effective-inflow"

const cashflowQuerySchema = z.object({
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
  startMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const cashflowBodySchema = z.object({
  profileId: z.string().uuid(),
  familyId: z.string().uuid().optional(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  inflow: z.number().min(0).optional(),
  outflow: z.number().min(0).optional(),
  source: z.string().optional(),
})

function getMonthsInRange(startMonth: string, endMonth: string): string[] {
  const months: string[] = []
  const [startY, startM] = startMonth.split("-").map(Number)
  const [endY, endM] = endMonth.split("-").map(Number)
  let y = startY
  let m = startM
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, "0")}-01`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return months
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const { searchParams } = request.nextUrl
    const parsed = cashflowQuerySchema.safeParse({
      profileId: searchParams.get("profileId") ?? undefined,
      familyId: searchParams.get("familyId") ?? undefined,
      startMonth: searchParams.get("startMonth"),
      endMonth: searchParams.get("endMonth"),
    })

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const { profileId, familyId, startMonth, endMonth } = parsed.data
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

    const { data: cashflowRows, error } = await supabase
      .from("monthly_cashflow")
      .select("profile_id, month, inflow, outflow")
      .in("profile_id", profileIds)
      .gte("month", startMonth)
      .lte("month", endMonth)
      .order("month", { ascending: true })

    if (error) {
      return NextResponse.json({ error: "Failed to fetch cashflow" }, { status: 500 })
    }

    const months = getMonthsInRange(startMonth, endMonth)
    const cashflowByProfileMonth = new Map<string, { inflow: number; outflow: number }>()
    for (const row of cashflowRows ?? []) {
      const key = `${row.profile_id}:${row.month}`
      cashflowByProfileMonth.set(key, {
        inflow: row.inflow ?? 0,
        outflow: row.outflow ?? 0,
      })
    }

    const result: Array<{
      month: string
      inflow: number
      discretionary: number
      insurance: number
      ilp: number
      loans: number
      tax: number
      totalOutflow: number
    }> = []

    for (const month of months) {
      let inflow = 0
      let discretionary = 0
      let insurance = 0
      let ilp = 0
      let loans = 0
      let tax = 0

      for (const pid of profileIds) {
        inflow += await getEffectiveInflowForProfile(supabase, pid, month)

        const eff = await getEffectiveOutflowForProfile(supabase, pid, month)
        discretionary += eff.discretionary
        insurance += eff.insurance
        ilp += eff.ilp
        loans += eff.loans
        tax += eff.tax
      }

      const totalOutflow = discretionary + insurance + ilp + loans + tax
      result.push({
        month,
        inflow,
        discretionary,
        insurance,
        ilp,
        loans,
        tax,
        totalOutflow,
      })
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error("[api/cashflow] GET Error:", err)
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
    const parsed = cashflowBodySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const { profileId, familyId, month, inflow, outflow, source } = parsed.data
    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      profileId,
      familyId ?? null
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }
    if (!resolved.profileIds.includes(profileId)) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const { data, error } = await supabase
      .from("monthly_cashflow")
      .upsert(
        {
          profile_id: profileId,
          month,
          ...(inflow !== undefined && { inflow }),
          ...(outflow !== undefined && { outflow }),
          ...(source !== undefined && { source }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id,month" },
      )
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to upsert cashflow" }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error("[api/cashflow] POST Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
