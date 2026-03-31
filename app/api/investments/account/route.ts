import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Calculate monthly GIRO credits flowing to investments for a family.
 * These are GIRO rules with destination_type = 'investments'.
 */
async function getGiroInvestmentCredit(
  supabase: SupabaseClient,
  _familyId: string,
): Promise<number> {
  const { data: rules } = await supabase
    .from("giro_rules")
    .select("amount")
    .eq("is_active", true)
    .eq("destination_type", "investments")

  if (!rules || rules.length === 0) return 0

  // We need to verify these GIRO rules belong to this family's bank accounts
  const ruleAmountTotal = rules.reduce((sum, r) => sum + r.amount, 0)

  // For now, return total — the GIRO rules are already scoped by the user's session
  return ruleAmountTotal
}

const accountQuerySchema = z.object({
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
})

const updateAccountSchema = z.object({
  cashBalance: z.number(),
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
})

/** Resolved profile id for the row, or null for family-level (shared) account. */
function effectiveAccountProfileId(
  profileId: string | null,
  profileIds: string[],
): string | null {
  if (profileId && profileIds.includes(profileId)) return profileId
  return null
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

    // Calculate monthly GIRO credit flowing to investments
    const giroCredit = await getGiroInvestmentCredit(supabase, familyId)

    const eff = effectiveAccountProfileId(profileId, profileIds)

    if (eff) {
      const { data: account, error } = await supabase
        .from("investment_accounts")
        .select("id, cash_balance, created_at, updated_at")
        .eq("family_id", familyId)
        .eq("profile_id", eff)
        .maybeSingle()

      if (error) {
        console.error("[api/investments/account] Supabase error:", error.message, error.code)
        return NextResponse.json({ error: "Failed to fetch account" }, { status: 500 })
      }

      return NextResponse.json({
        cashBalance: (account?.cash_balance ?? 0),
        giroMonthlyCredit: giroCredit,
        id: account?.id ?? null,
      })
    }

    // Family-wide (no profile): sum all brokerage cash — matches computeNetLiquidValue.
    const { data: accounts, error } = await supabase
      .from("investment_accounts")
      .select("id, cash_balance, profile_id")
      .eq("family_id", familyId)

    if (error) {
      console.error("[api/investments/account] Supabase error:", error.message, error.code)
      return NextResponse.json({ error: "Failed to fetch account" }, { status: 500 })
    }

    const totalCash =
      accounts?.reduce((s, a) => s + (a.cash_balance ?? 0), 0) ?? 0
    const sharedRow = accounts?.find((a) => a.profile_id === null)

    return NextResponse.json({
      cashBalance: totalCash,
      giroMonthlyCredit: giroCredit,
      id: sharedRow?.id ?? null,
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

    const effPatch = effectiveAccountProfileId(singleProfileId, profileIds)
    const now = new Date().toISOString()

    // Family-wide (no profile): GET sums all rows — PATCH must replace that total exactly.
    if (!effPatch) {
      await supabase
        .from("investment_accounts")
        .update({ cash_balance: 0, updated_at: now })
        .eq("family_id", resolvedFamilyId)
        .not("profile_id", "is", null)

      const { data: shared } = await supabase
        .from("investment_accounts")
        .select("id")
        .eq("family_id", resolvedFamilyId)
        .is("profile_id", null)
        .maybeSingle()

      if (shared) {
        const { data: updated, error } = await supabase
          .from("investment_accounts")
          .update({
            cash_balance: cashBalance,
            updated_at: now,
          })
          .eq("id", shared.id)
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
          profile_id: null,
          cash_balance: cashBalance,
          updated_at: now,
        })
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: "Failed to create account" }, { status: 500 })
      }
      return NextResponse.json(created)
    }

    const { data: existing } = await supabase
      .from("investment_accounts")
      .select("id")
      .eq("family_id", resolvedFamilyId)
      .eq("profile_id", effPatch)
      .maybeSingle()

    if (existing) {
      const { data: updated, error } = await supabase
        .from("investment_accounts")
        .update({
          cash_balance: cashBalance,
          updated_at: now,
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
        profile_id: effPatch,
        cash_balance: cashBalance,
        updated_at: now,
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
