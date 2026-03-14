import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { z } from "zod"

const promptSchema = z.object({
  prompt_type: z.enum(["end_of_month", "income", "insurance", "tax"]),
  frequency: z.enum(["monthly", "yearly"]),
  day_of_month: z.number().int().min(1).max(31),
  month_of_year: z.number().int().min(1).max(12).nullable().optional(),
  time: z.string(),
  timezone: z.string(),
})

const remindersRouteSchema = z.object({
  mode: z.enum(["first-time", "new-family", "resume"]).optional().default("first-time"),
  familyId: z.string().uuid().optional(),
  promptSchedule: z.array(promptSchema).min(1),
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
    const parsed = remindersRouteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", message: parsed.error.message },
        { status: 400 },
      )
    }

    const { familyId: bodyFamilyId, promptSchedule } = parsed.data
    const supabase = createSupabaseAdmin()

    let familyId = bodyFamilyId
    if (!familyId) {
      const { data: fam } = await supabase
        .from("families")
        .select("id")
        .eq("household_id", session.accountId)
        .order("created_at", { ascending: true })
        .limit(1)
        .single()
      if (!fam) {
        return NextResponse.json(
          { error: "No family found. Complete users and profiles steps first." },
          { status: 400 },
        )
      }
      familyId = fam.id
    }

    await supabase
      .from("prompt_schedule")
      .delete()
      .eq("family_id", familyId)

    if (promptSchedule.length > 0) {
      const { error } = await supabase.from("prompt_schedule").insert(
        promptSchedule.map((s) => ({
          family_id: familyId,
          prompt_type: s.prompt_type,
          frequency: s.frequency,
          day_of_month: s.day_of_month,
          month_of_year: s.month_of_year ?? null,
          time: s.time,
          timezone: s.timezone,
        })),
      )
      if (error) {
        console.error("Onboarding reminders error:", error)
        return NextResponse.json(
          { error: "Failed to save prompt schedule" },
          { status: 500 },
        )
      }
    }

    return NextResponse.json({ success: true, familyId })
  } catch (error) {
    console.error("Onboarding reminders error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
