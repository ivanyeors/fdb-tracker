import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"

const accountQuerySchema = z.object({
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
})

const updateAccountSchema = z.object({
  cashBalance: z.number(),
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
})

function getAccountFilter(
  familyId: string,
  profileId: string | null,
  profileIds: string[],
) {
  if (profileId && profileIds.includes(profileId)) {
    return { family_id: familyId, profile_id: profileId }
  }
  return { family_id: familyId, profile_id: null }
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const { searchParams } = request.nextUrl
    const parsed = accountQuerySchema.safeParse({
      profileId: searchParams.get("profileId") ?? undefined,
      familyId: searchParams.get("familyId") ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      parsed.data.profileId ?? null,
      parsed.data.familyId ?? null,
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }

    const { familyId, profileIds } = resolved
    const profileId = parsed.data.profileId ?? null
    const filter = getAccountFilter(familyId, profileId, profileIds)

    const { data: account, error } = await supabase
      .from("investment_accounts")
      .select("id, cash_balance, created_at, updated_at")
      .match(filter)
      .maybeSingle()

    if (error) {
      console.error("[api/investments/account] Supabase error:", error.message, error.code)
      return NextResponse.json({ error: "Failed to fetch account" }, { status: 500 })
    }

    return NextResponse.json({
      cashBalance: account?.cash_balance ?? 0,
      id: account?.id ?? null,
    })
  } catch (err) {
    console.error("[api/investments/account] GET Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const body = await request.json()
    const parsed = updateAccountSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const { cashBalance, profileId, familyId } = parsed.data
    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      profileId ?? null,
      familyId ?? null,
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }
    if (profileId && !resolved.profileIds.includes(profileId)) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const { familyId: resolvedFamilyId, profileIds } = resolved
    const singleProfileId = profileId ?? null
    const filter = getAccountFilter(resolvedFamilyId, singleProfileId, profileIds)

    const { data: existing } = await supabase
      .from("investment_accounts")
      .select("id")
      .match(filter)
      .maybeSingle()

    if (existing) {
      const { data: updated, error } = await supabase
        .from("investment_accounts")
        .update({
          cash_balance: cashBalance,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: "Failed to update account" }, { status: 500 })
      }
      return NextResponse.json(updated)
    }

    const { data: created, error } = await supabase
      .from("investment_accounts")
      .insert({
        family_id: resolvedFamilyId,
        profile_id: singleProfileId,
        cash_balance: cashBalance,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to create account" }, { status: 500 })
    }
    return NextResponse.json(created)
  } catch (err) {
    console.error("[api/investments/account] PATCH Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return PATCH(request)
}
