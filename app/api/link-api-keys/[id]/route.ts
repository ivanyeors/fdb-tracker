import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params

    const supabase = createSupabaseAdmin()
    const { data: key, error: fetchError } = await supabase
      .from("link_api_keys")
      .select("id, household_id")
      .eq("id", id)
      .single()

    if (fetchError || !key) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 })
    }

    if (key.household_id !== session.accountId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { error: deleteError } = await supabase
      .from("link_api_keys")
      .delete()
      .eq("id", id)

    if (deleteError) {
      console.error("[link-api-keys] DELETE error:", deleteError)
      return NextResponse.json({ error: "Failed to delete API key" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[link-api-keys] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
