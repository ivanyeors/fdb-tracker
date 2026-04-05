import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const supabase = createSupabaseAdmin()

  const { error } = await supabase
    .from("signup_codes")
    .delete()
    .eq("id", id)
    .eq("created_by_household_id", session.accountId)

  if (error) {
    return NextResponse.json(
      { error: "Failed to delete invite code" },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
