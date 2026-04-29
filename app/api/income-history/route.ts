import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import {
  decodeIncomeHistoryPii,
  encodeIncomeHistoryPiiPatch,
} from "@/lib/repos/income-history"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"

const querySchema = z.object({
  profileId: z.uuid().optional(),
  familyId: z.uuid().optional(),
})

const createSchema = z.object({
  profileId: z.uuid(),
  employerName: z.string().min(1).max(200),
  monthlySalary: z.number().min(0),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  isPrimary: z.boolean().optional(),
})

const updateSchema = createSchema.partial().extend({
  id: z.uuid(),
  profileId: z.uuid(),
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

    const { data } = await supabase
      .from("income_history")
      .select("*")
      .in("profile_id", resolved.profileIds)
      .order("start_date", { ascending: false })

    const decoded = (data ?? []).map((r) => ({
      ...r,
      monthly_salary: decodeIncomeHistoryPii(r).monthly_salary,
    }))
    return NextResponse.json(decoded)
  } catch (err) {
    console.error("[api/income-history] GET error:", err)
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
    const parsed = createSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })

    const { profileId, employerName, monthlySalary, startDate, endDate, isPrimary } =
      parsed.data
    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      profileId,
      null,
    )
    if (!resolved?.profileIds.includes(profileId))
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 },
      )

    const { data, error } = await supabase
      .from("income_history")
      .insert({
        profile_id: profileId,
        employer_name: employerName,
        ...encodeIncomeHistoryPiiPatch({ monthly_salary: monthlySalary }),
        start_date: startDate,
        end_date: endDate ?? null,
        is_primary: isPrimary ?? true,
      })
      .select()
      .single()

    if (error) {
      console.error("[api/income-history] Insert error:", error)
      return NextResponse.json(
        { error: "Failed to save income history" },
        { status: 500 },
      )
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error("[api/income-history] POST error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest) {
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
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })

    const { id, profileId, ...updates } = parsed.data
    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      profileId,
      null,
    )
    if (!resolved?.profileIds.includes(profileId))
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 },
      )

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (updates.employerName !== undefined)
      updatePayload.employer_name = updates.employerName
    if (updates.monthlySalary !== undefined) {
      Object.assign(
        updatePayload,
        encodeIncomeHistoryPiiPatch({ monthly_salary: updates.monthlySalary }),
      )
    }
    if (updates.startDate !== undefined)
      updatePayload.start_date = updates.startDate
    if (updates.endDate !== undefined)
      updatePayload.end_date = updates.endDate
    if (updates.isPrimary !== undefined)
      updatePayload.is_primary = updates.isPrimary

    const { data, error } = await supabase
      .from("income_history")
      .update(updatePayload)
      .eq("id", id)
      .eq("profile_id", profileId)
      .select()
      .single()

    if (error) {
      console.error("[api/income-history] Update error:", error)
      return NextResponse.json(
        { error: "Failed to update income history" },
        { status: 500 },
      )
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error("[api/income-history] PUT error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest) {
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
    const id = searchParams.get("id")
    const profileId = searchParams.get("profileId")
    if (!id || !profileId)
      return NextResponse.json(
        { error: "Missing id or profileId" },
        { status: 400 },
      )

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      profileId,
      null,
    )
    if (!resolved?.profileIds.includes(profileId))
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 },
      )

    const { error } = await supabase
      .from("income_history")
      .delete()
      .eq("id", id)
      .eq("profile_id", profileId)

    if (error) {
      console.error("[api/income-history] Delete error:", error)
      return NextResponse.json(
        { error: "Failed to delete income history" },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[api/income-history] DELETE error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
