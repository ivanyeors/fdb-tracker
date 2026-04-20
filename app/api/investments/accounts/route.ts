import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"

const createAccountSchema = z.object({
  accountName: z.string().min(1).max(100),
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
  initialBalance: z.number().optional().default(0),
})

const deleteAccountSchema = z.object({
  accountId: z.string().uuid(),
  familyId: z.string().uuid().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const parsed = createAccountSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", message: parsed.error.message },
        { status: 400 },
      )
    }

    const { accountName, profileId, familyId, initialBalance } = parsed.data
    const supabase = createSupabaseAdmin()

    const resolved = await resolveFamilyAndProfiles(
      supabase,
      session.accountId,
      profileId ?? null,
      familyId ?? null,
    )
    if (!resolved) {
      return NextResponse.json(
        { error: "Family or profile not found" },
        { status: 404 },
      )
    }

    const effProfileId =
      profileId && resolved.profileIds.includes(profileId) ? profileId : null

    const { data: account, error } = await supabase
      .from("investment_accounts")
      .insert({
        family_id: resolved.familyId,
        profile_id: effProfileId,
        account_name: accountName,
        cash_balance: initialBalance,
      })
      .select("id, account_name, cash_balance")
      .single()

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `Account "${accountName}" already exists` },
          { status: 409 },
        )
      }
      console.error("Create investment account error:", error)
      return NextResponse.json(
        { error: "Failed to create account" },
        { status: 500 },
      )
    }

    return NextResponse.json(account)
  } catch (err) {
    console.error("POST /api/investments/accounts error:", err)
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

    const body = await request.json()
    const parsed = deleteAccountSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", message: parsed.error.message },
        { status: 400 },
      )
    }

    const { accountId, familyId } = parsed.data
    const supabase = createSupabaseAdmin()

    const resolved = await resolveFamilyAndProfiles(
      supabase,
      session.accountId,
      null,
      familyId ?? null,
    )
    if (!resolved) {
      return NextResponse.json(
        { error: "Family not found" },
        { status: 404 },
      )
    }

    // Check no holdings reference this account
    const { count: holdingCount } = await supabase
      .from("investments")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)

    if ((holdingCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete account with existing holdings. Sell or transfer holdings first.",
        },
        { status: 400 },
      )
    }

    const { error } = await supabase
      .from("investment_accounts")
      .delete()
      .eq("id", accountId)
      .eq("family_id", resolved.familyId)

    if (error) {
      console.error("Delete investment account error:", error)
      return NextResponse.json(
        { error: "Failed to delete account" },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("DELETE /api/investments/accounts error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
