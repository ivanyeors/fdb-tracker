import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { enrichInvestmentsWithLivePrices } from "@/lib/investments/enrich-with-live-prices"
import { getSgdPerUsd } from "@/lib/external/usd-sgd"

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

    const enriched = await enrichInvestmentsWithLivePrices(investments)
    const sgdPerUsd = await getSgdPerUsd()

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

    const { data: inv, error: insertErr } = await supabase
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

    if (insertErr || !inv) {
      return NextResponse.json({ error: "Failed to create investment" }, { status: 500 })
    }

    const tradeAmount = units * costBasis
    const accountFilter = {
      family_id: resolved.familyId,
      profile_id: profileId ?? null,
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
        await supabase.from("investments").delete().eq("id", inv.id)
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
        await supabase.from("investments").delete().eq("id", inv.id)
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
      await supabase.from("investments").delete().eq("id", inv.id)
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
