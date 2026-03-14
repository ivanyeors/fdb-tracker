import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = createSupabaseAdmin()
    const { data: families } = await supabase
      .from("families")
      .select("id")
      .eq("household_id", session.accountId)
      .order("created_at", { ascending: true })

    const familyIds = (families ?? []).map((f) => f.id)
    if (familyIds.length === 0) {
      return NextResponse.json({ profiles: [], showCompleteSetup: false })
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, optional_onboarding_completed_at, family_id")
      .in("family_id", familyIds)
      .order("created_at", { ascending: true })

    const incompleteProfiles = (profiles ?? []).filter(
      (p) => p.optional_onboarding_completed_at == null,
    )

    const result = {
      profiles: incompleteProfiles.map((p) => ({
        id: p.id,
        name: p.name,
        optionalComplete: false,
      })),
      showCompleteSetup: incompleteProfiles.length > 0,
    }

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
