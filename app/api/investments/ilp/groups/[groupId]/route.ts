import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const body = await request.json().catch(() => ({}))
    const familyId =
      typeof body === "object" &&
      body !== null &&
      "familyId" in body &&
      typeof (body as { familyId?: unknown }).familyId === "string"
        ? (body as { familyId: string }).familyId
        : undefined

    if (!familyId) {
      return NextResponse.json(
        { error: "familyId is required" },
        { status: 400 },
      )
    }

    const { groupId } = await params
    const supabase = createSupabaseAdmin()

    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      null,
      familyId,
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family not found" }, { status: 404 })
    }

    // Verify the group belongs to this family
    const { data: group } = await supabase
      .from("ilp_fund_groups")
      .select("id")
      .eq("id", groupId)
      .eq("family_id", resolved.familyId)
      .maybeSingle()

    if (!group) {
      return NextResponse.json(
        { error: "Fund group not found" },
        { status: 404 },
      )
    }

    // Delete the group — CASCADE removes junction rows (ilp_fund_group_members).
    // Products are NOT deleted; they simply become ungrouped.
    const { error: groupErr } = await supabase
      .from("ilp_fund_groups")
      .delete()
      .eq("id", groupId)
      .eq("family_id", resolved.familyId)

    if (groupErr) {
      return NextResponse.json(
        { error: "Failed to delete fund group" },
        { status: 500 },
      )
    }

    return new NextResponse(null, { status: 204 })
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
