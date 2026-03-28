import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const schema = z.object({
  bankAccountId: z.string().uuid().nullable(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id: profileId } = await params
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()

    // Verify ownership: profile → family → household
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, family_id")
      .eq("id", profileId)
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
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // If setting a bank account, verify it belongs to this profile or is shared
    if (parsed.data.bankAccountId) {
      const { data: bankAccount } = await supabase
        .from("bank_accounts")
        .select("id, profile_id")
        .eq("id", parsed.data.bankAccountId)
        .eq("family_id", family.id)
        .single()

      if (!bankAccount) {
        return NextResponse.json(
          { error: "Bank account not found" },
          { status: 404 },
        )
      }

      if (
        bankAccount.profile_id !== null &&
        bankAccount.profile_id !== profileId
      ) {
        return NextResponse.json(
          { error: "Bank account belongs to a different profile" },
          { status: 400 },
        )
      }
    }

    const { error } = await supabase
      .from("profiles")
      .update({ primary_bank_account_id: parsed.data.bankAccountId })
      .eq("id", profileId)

    if (error) {
      return NextResponse.json(
        { error: "Failed to update primary account" },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
