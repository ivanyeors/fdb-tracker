import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = request.nextUrl
    const profileId = searchParams.get("profileId")

    const supabase = createSupabaseAdmin()

    if (!profileId) {
      return NextResponse.json({ error: "Missing profileId" }, { status: 400 })
    }

    // Verify profile belongs to household
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", profileId)
      .eq("household_id", session.accountId)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found or unauthorized" }, { status: 403 })
    }

    // Fetch tax entries
    const { data: taxEntries, error: taxError } = await supabase
      .from("tax_entries")
      .select("*")
      .eq("profile_id", profileId)
      .order("year", { ascending: false })

    if (taxError) {
      return NextResponse.json({ error: "Failed to fetch tax entries" }, { status: 500 })
    }

    // Fetch tax relief inputs
    const { data: reliefInputs, error: reliefError } = await supabase
      .from("tax_relief_inputs")
      .select("*")
      .eq("profile_id", profileId)
      .order("year", { ascending: false })

    if (reliefError) {
      return NextResponse.json({ error: "Failed to fetch tax reliefs" }, { status: 500 })
    }

    return NextResponse.json({
      entries: taxEntries || [],
      reliefs: reliefInputs || [],
    })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
