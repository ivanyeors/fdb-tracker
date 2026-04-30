import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const postBodySchema = z.object({
  profile_id: z.uuid(),
  year: z.number().int().min(2020).max(2040),
  actual_amount: z.number().min(0),
})

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const parsed = postBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body", details: z.flattenError(parsed.error) }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, family_id")
      .eq("id", parsed.data.profile_id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const { data: family } = await supabase
      .from("families")
      .select("id")
      .eq("id", profile.family_id)
      .eq("household_id", session.accountId)
      .single()

    if (!family) {
      return NextResponse.json({ error: "Profile not found or unauthorized" }, { status: 404 })
    }

    const { data: existing } = await supabase
      .from("tax_entries")
      .select("calculated_amount")
      .eq("profile_id", parsed.data.profile_id)
      .eq("year", parsed.data.year)
      .single()

    const { data: updated, error } = await supabase
      .from("tax_entries")
      .upsert(
        {
          profile_id: parsed.data.profile_id,
          year: parsed.data.year,
          calculated_amount: existing?.calculated_amount ?? 0,
          actual_amount: parsed.data.actual_amount,
        },
        { onConflict: "profile_id,year" }
      )
      .select()
      .single()

    if (error) {
      console.error("[api/tax/actual] Error:", error)
      return NextResponse.json({ error: "Failed to update actual tax" }, { status: 500 })
    }

    return NextResponse.json({ success: true, entry: updated })
  } catch (err) {
    console.error("[api/tax/actual] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
