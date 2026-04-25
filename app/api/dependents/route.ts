import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { decodeDependentPii } from "@/lib/repos/dependents"
import { createSupabaseAdmin } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const familyId = request.nextUrl.searchParams.get("familyId")
  if (!familyId) return NextResponse.json({ error: "familyId required" }, { status: 400 })

  const supabase = createSupabaseAdmin()

  const { data: family } = await supabase
    .from("families")
    .select("id")
    .eq("id", familyId)
    .eq("household_id", session.accountId)
    .single()
  if (!family) return NextResponse.json({ error: "Family not found" }, { status: 404 })

  const { data: rawDependents, error } = await supabase
    .from("dependents")
    .select("*")
    .eq("family_id", familyId)

  if (error) return NextResponse.json({ error: "Failed to fetch dependents" }, { status: 500 })

  // Decrypt PII fields and sort by birth_year in app (column may be encrypted-only post-cutover)
  const dependents = (rawDependents ?? [])
    .map((d) => {
      const decoded = decodeDependentPii(d)
      return {
        ...d,
        name: decoded.name ?? d.name,
        birth_year: decoded.birth_year ?? d.birth_year,
        annual_income: decoded.annual_income ?? d.annual_income,
      }
    })
    .sort((a, b) => (a.birth_year ?? 0) - (b.birth_year ?? 0))

  return NextResponse.json({ dependents })
}
