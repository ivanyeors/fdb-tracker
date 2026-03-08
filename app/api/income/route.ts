import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { getAge, getCpfRates } from "@/lib/calculations/cpf"

const incomeQuerySchema = z.object({
  profileId: z.string().uuid(),
})

const incomeUpdateSchema = z.object({
  profileId: z.string().uuid(),
  annualSalary: z.number().min(0),
  bonusEstimate: z.number().min(0).optional(),
  payFrequency: z.string().optional(),
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
    const parsed = incomeQuerySchema.safeParse({
      profileId: searchParams.get("profileId"),
    })

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const { profileId } = parsed.data
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
    const token = cookieStore.get("fdb-session")?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { householdId } = session

    const body = await request.json()
    const parsed = incomeUpdateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const { profileId, annualSalary, bonusEstimate, payFrequency } = parsed.data
    const supabase = createSupabaseAdmin()

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, birth_year")
      .eq("id", profileId)
      .eq("household_id", householdId)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const currentYear = new Date().getFullYear()
    const age = getAge(profile.birth_year, currentYear)
    const cpfRates = getCpfRates(age, currentYear)

    const { data, error } = await supabase
      .from("income_config")
      .upsert(
        {
          profile_id: profileId,
          annual_salary: annualSalary,
          ...(bonusEstimate !== undefined && { bonus_estimate: bonusEstimate }),
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
