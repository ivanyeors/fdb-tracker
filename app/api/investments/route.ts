import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { enrichInvestmentsWithLivePrices } from "@/lib/investments/enrich-with-live-prices"
import { getSgdPerUsd } from "@/lib/external/usd-sgd"
import { calculateWeightedAverageCost } from "@/lib/calculations/investments"

const investmentsQuerySchema = z.object({
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
})

const createInvestmentSchema = z.object({
  symbol: z.string().min(1),
  type: z.string().min(1),
  units: z.number().min(0),
  costBasis: z.number().min(0),
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
  /** Optional note stored on the linked buy transaction (same flow as Telegram /buy). */
  journalText: z.string().max(2000).optional(),
  /** Optional date when the investment actually started (YYYY-MM-DD). */
  dateAdded: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const { searchParams } = request.nextUrl
    const parsed = investmentsQuerySchema.safeParse({
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
      parsed.data.familyId ?? null
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }
    const { familyId } = resolved
    const profileId = parsed.data.profileId ?? null

    let query = supabase
      .from("investments")
      .select("*")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true })

    if (profileId) {
      query = query.or(
        `profile_id.eq.${profileId},profile_id.is.null`,
      )
    }

    const { data: investments, error } = await query

    if (error) {
      return NextResponse.json({ error: "Failed to fetch investments" }, { status: 500 })
    }

    if (!investments) return NextResponse.json([])

    const [enriched, sgdPerUsd] = await Promise.all([
      enrichInvestmentsWithLivePrices(investments),
      getSgdPerUsd(),
    ])

    return NextResponse.json({ investments: enriched, sgdPerUsd })
  } catch (err) {
    console.error("[api/investments] GET Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const body = await request.json()
    const parsed = createInvestmentSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const { symbol, type, units, costBasis, profileId, familyId, journalText, dateAdded } =
      parsed.data
    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      profileId ?? null,
      familyId ?? null
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }
    if (profileId && !resolved.profileIds.includes(profileId)) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    let existingQuery = supabase
      .from("investments")
      .select("*")
      .eq("family_id", resolved.familyId)
      .eq("symbol", symbol)
      .eq("type", type)
      .order("created_at", { ascending: true })
      .limit(1)
    existingQuery = profileId
      ? existingQuery.eq("profile_id", profileId)
      : existingQuery.is("profile_id", null)
    const { data: existingRows } = await existingQuery
    const existingInv = existingRows?.[0] ?? null

    let inv: NonNullable<typeof existingInv>
    let holdingSnapshot: { id: string; units: number; cost_basis: number } | null = null
    let insertedHoldingId: string | null = null

    if (existingInv) {
      holdingSnapshot = {
        id: existingInv.id,
        units: existingInv.units,
        cost_basis: existingInv.cost_basis,
      }
      const mergedCost = calculateWeightedAverageCost(
        existingInv.units,
        existingInv.cost_basis,
        units,
        costBasis,
      )
      const { data: updated, error: updateErr } = await supabase
        .from("investments")
        .update({
          units: existingInv.units + units,
          cost_basis: mergedCost,
          ...(dateAdded && { date_added: dateAdded }),
        })
        .eq("id", existingInv.id)
        .select()
        .single()
      if (updateErr || !updated) {
        return NextResponse.json({ error: "Failed to update investment" }, { status: 500 })
      }
      inv = updated
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from("investments")
        .insert({
          family_id: resolved.familyId,
          symbol,
          type,
          units,
          cost_basis: costBasis,
          ...(profileId && { profile_id: profileId }),
          ...(dateAdded && { date_added: dateAdded }),
        })
        .select()
        .single()
      if (insertErr || !inserted) {
        return NextResponse.json({ error: "Failed to create investment" }, { status: 500 })
      }
      inv = inserted
      insertedHoldingId = inserted.id
    }

    const tradeAmount = units * costBasis
    const accountFilter = {
      family_id: resolved.familyId,
      profile_id: profileId ?? null,
    }

    const rollbackHolding = async () => {
      if (holdingSnapshot) {
        await supabase
          .from("investments")
          .update({
            units: holdingSnapshot.units,
            cost_basis: holdingSnapshot.cost_basis,
          })
          .eq("id", holdingSnapshot.id)
      } else if (insertedHoldingId) {
        await supabase.from("investments").delete().eq("id", insertedHoldingId)
      }
    }

    let restoredCash: { id: string; balance: number } | null = null
    let newAccountId: string | null = null

    const { data: accountRow } = await supabase
      .from("investment_accounts")
      .select("id, cash_balance")
      .match(accountFilter)
      .maybeSingle()

    if (accountRow) {
      restoredCash = {
        id: accountRow.id,
        balance: accountRow.cash_balance,
      }
      const { error: cashErr } = await supabase
        .from("investment_accounts")
        .update({
          cash_balance: accountRow.cash_balance - tradeAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", accountRow.id)

      if (cashErr) {
        await rollbackHolding()
        return NextResponse.json(
          { error: "Failed to update investment cash" },
          { status: 500 },
        )
      }
    } else {
      const { data: newAcc, error: accInsErr } = await supabase
        .from("investment_accounts")
        .insert({
          family_id: resolved.familyId,
          profile_id: profileId ?? null,
          cash_balance: -tradeAmount,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single()

      if (accInsErr || !newAcc) {
        await rollbackHolding()
        return NextResponse.json(
          { error: "Failed to create investment account" },
          { status: 500 },
        )
      }
      newAccountId = newAcc.id
    }

    const memo = journalText?.trim()
    const { error: txErr } = await supabase.from("investment_transactions").insert({
      family_id: resolved.familyId,
      investment_id: inv.id,
      symbol,
      type: "buy",
      quantity: units,
      price: costBasis,
      ...(memo ? { journal_text: memo } : {}),
      ...(profileId && { profile_id: profileId }),
    })

    if (txErr) {
      if (restoredCash) {
        await supabase
          .from("investment_accounts")
          .update({
            cash_balance: restoredCash.balance,
            updated_at: new Date().toISOString(),
          })
          .eq("id", restoredCash.id)
      } else if (newAccountId) {
        await supabase.from("investment_accounts").delete().eq("id", newAccountId)
      }
      await rollbackHolding()
      return NextResponse.json(
        { error: "Failed to record buy transaction" },
        { status: 500 },
      )
    }

    return NextResponse.json(inv, { status: 201 })
  } catch (err) {
    console.error("[api/investments] POST Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
