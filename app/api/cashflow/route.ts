import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const cashflowQuerySchema = z.object({
  profileId: z.string().uuid(),
  startMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const cashflowBodySchema = z.object({
  profileId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  inflow: z.number().min(0).optional(),
  outflow: z.number().min(0).optional(),
  source: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("fdb-session")?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { householdId } = session

    const { searchParams } = request.nextUrl
    const parsed = cashflowQuerySchema.safeParse({
      profileId: searchParams.get("profileId"),
      startMonth: searchParams.get("startMonth"),
      endMonth: searchParams.get("endMonth"),
    })

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const { profileId, startMonth, endMonth } = parsed.data
    const supabase = createSupabaseAdmin()

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", profileId)
      .eq("household_id", householdId)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const { data, error } = await supabase
      .from("monthly_cashflow")
      .select("*")
      .eq("profile_id", profileId)
      .gte("month", startMonth)
      .lte("month", endMonth)
      .order("month", { ascending: true })

    if (error) {
      return NextResponse.json({ error: "Failed to fetch cashflow" }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("fdb-session")?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { householdId } = session

    const body = await request.json()
    const parsed = cashflowBodySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const { profileId, month, inflow, outflow, source } = parsed.data
    const supabase = createSupabaseAdmin()

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", profileId)
      .eq("household_id", householdId)
      .single()

    if (!profile) {
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
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
