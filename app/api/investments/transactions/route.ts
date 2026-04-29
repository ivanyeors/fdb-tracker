import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { calculateWeightedAverageCost } from "@/lib/calculations/investments"
import { fetchTransactions } from "@/lib/api/transactions-data"

const transactionQuerySchema = z.object({
  symbol: z.string().optional(),
  type: z.enum(["buy", "sell"]).optional(),
  profileId: z.uuid().optional(),
  familyId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

const createTransactionSchema = z.object({
  symbol: z.string().min(1),
  type: z.enum(["buy", "sell", "dividend"]),
  quantity: z.number().positive(),
  price: z.number().min(0),
  commission: z.number().min(0).optional().default(0),
  journalText: z.string().optional(),
  screenshotUrl: z.url().optional(),
  profileId: z.uuid().optional(),
  familyId: z.uuid().optional(),
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
    const parsed = transactionQuerySchema.safeParse({
      symbol: searchParams.get("symbol") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      profileId: searchParams.get("profileId") ?? undefined,
      familyId: searchParams.get("familyId") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const { symbol, type, profileId, familyId, limit = 50 } = parsed.data
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

    const data = await fetchTransactions(supabase, {
      familyId: resolved.familyId,
      profileId: profileId ?? null,
      limit,
      symbol,
      type,
    })

    return NextResponse.json(data)
  } catch {
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
    const parsed = createTransactionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const { symbol, type, quantity, price, commission, journalText, screenshotUrl, profileId, familyId } =
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

    let holdingQuery = supabase
      .from("investments")
      .select("*")
      .eq("family_id", resolved.familyId)
      .eq("symbol", symbol)
      .order("created_at", { ascending: true })
      .limit(1)

    if (profileId) {
      holdingQuery = holdingQuery.or(
        `profile_id.eq.${profileId},profile_id.is.null`,
      )
    }

    const { data: holdingRows } = await holdingQuery
    const existingHolding = holdingRows?.[0] ?? null

    const amount = quantity * price
    // Cash actually spent (buy) or received (sell) after commission
    const buyCashOutlay = amount + commission
    const sellCashProceeds = amount - commission
    const accountFilter = {
      family_id: resolved.familyId,
      profile_id: profileId ?? null,
    }

    if (type === "sell") {
      if (!existingHolding || existingHolding.units < quantity) {
        return NextResponse.json(
          { error: "Insufficient units to sell" },
          { status: 400 },
        )
      }

      const newUnits = existingHolding.units - quantity

      // Step 1: Update holding units
      const { error: updateError } = await supabase
        .from("investments")
        .update({ units: newUnits })
        .eq("id", existingHolding.id)

      if (updateError) {
        return NextResponse.json({ error: "Failed to update holding" }, { status: 500 })
      }

      // Step 2: Update cash balance
      const { data: accountRow } = await supabase
        .from("investment_accounts")
        .select("id, cash_balance")
        .match(accountFilter)
        .maybeSingle()

      if (accountRow) {
        const { error: cashError } = await supabase
          .from("investment_accounts")
          .update({
            cash_balance: accountRow.cash_balance + sellCashProceeds,
            updated_at: new Date().toISOString(),
          })
          .eq("id", accountRow.id)

        if (cashError) {
          // Rollback: restore holding units
          await supabase
            .from("investments")
            .update({ units: existingHolding.units })
            .eq("id", existingHolding.id)
          return NextResponse.json({ error: "Failed to update cash balance" }, { status: 500 })
        }
      } else {
        const { error: cashError } = await supabase
          .from("investment_accounts")
          .insert({
            family_id: resolved.familyId,
            profile_id: profileId ?? null,
            cash_balance: sellCashProceeds,
            updated_at: new Date().toISOString(),
          })

        if (cashError) {
          await supabase
            .from("investments")
            .update({ units: existingHolding.units })
            .eq("id", existingHolding.id)
          return NextResponse.json({ error: "Failed to create cash account" }, { status: 500 })
        }
      }

      // Step 3: Insert transaction record
      const { data: transaction, error: txError } = await supabase
        .from("investment_transactions")
        .insert({
          family_id: resolved.familyId,
          investment_id: existingHolding.id,
          symbol,
          type,
          quantity,
          price,
          commission,
          ...(journalText && { journal_text: journalText }),
          ...(screenshotUrl && { screenshot_url: screenshotUrl }),
          ...(profileId && { profile_id: profileId }),
        })
        .select()
        .single()

      if (txError) {
        // Rollback: restore holding and cash
        await supabase
          .from("investments")
          .update({ units: existingHolding.units })
          .eq("id", existingHolding.id)
        const { data: acctRollback } = await supabase
          .from("investment_accounts")
          .select("id, cash_balance")
          .match(accountFilter)
          .maybeSingle()
        if (acctRollback) {
          await supabase
            .from("investment_accounts")
            .update({
              cash_balance: acctRollback.cash_balance - sellCashProceeds,
              updated_at: new Date().toISOString(),
            })
            .eq("id", acctRollback.id)
        }
        return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 })
      }

      return NextResponse.json(transaction, { status: 201 })
    }

    // --- DIVIDEND flow ---
    if (type === "dividend") {
      // Credit cash balance with dividend amount (quantity × price = total dividend)
      const { data: accountRow } = await supabase
        .from("investment_accounts")
        .select("id, cash_balance")
        .match(accountFilter)
        .maybeSingle()

      if (accountRow) {
        const { error: cashError } = await supabase
          .from("investment_accounts")
          .update({
            cash_balance: accountRow.cash_balance + amount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", accountRow.id)

        if (cashError) {
          return NextResponse.json({ error: "Failed to update cash balance" }, { status: 500 })
        }
      } else {
        const { error: cashError } = await supabase
          .from("investment_accounts")
          .insert({
            family_id: resolved.familyId,
            profile_id: profileId ?? null,
            cash_balance: amount,
            updated_at: new Date().toISOString(),
          })

        if (cashError) {
          return NextResponse.json({ error: "Failed to create cash account" }, { status: 500 })
        }
      }

      // Insert transaction record
      const { data: transaction, error: txError } = await supabase
        .from("investment_transactions")
        .insert({
          family_id: resolved.familyId,
          investment_id: existingHolding?.id ?? null,
          symbol,
          type: "dividend",
          quantity,
          price,
          ...(journalText && { journal_text: journalText }),
          ...(profileId && { profile_id: profileId }),
        })
        .select()
        .single()

      if (txError) {
        return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 })
      }

      return NextResponse.json(transaction, { status: 201 })
    }

    // --- BUY flow ---
    let investmentId: string
    let wasNewHolding = false

    if (existingHolding) {
      const newCostBasis = calculateWeightedAverageCost(
        existingHolding.units,
        existingHolding.cost_basis,
        quantity,
        price,
        commission,
      )
      const newUnits = existingHolding.units + quantity

      const { error: updateError } = await supabase
        .from("investments")
        .update({ units: newUnits, cost_basis: newCostBasis })
        .eq("id", existingHolding.id)

      if (updateError) {
        return NextResponse.json({ error: "Failed to update holding" }, { status: 500 })
      }

      investmentId = existingHolding.id
    } else {
      // For new holdings, bake commission into cost basis
      const effectiveCostBasis =
        commission > 0 ? (amount + commission) / quantity : price
      const { data: newHolding, error: insertError } = await supabase
        .from("investments")
        .insert({
          family_id: resolved.familyId,
          symbol,
          type: "stock",
          units: quantity,
          cost_basis: effectiveCostBasis,
          ...(profileId && { profile_id: profileId }),
        })
        .select()
        .single()

      if (insertError || !newHolding) {
        return NextResponse.json({ error: "Failed to create holding" }, { status: 500 })
      }

      investmentId = newHolding.id
      wasNewHolding = true
    }

    // Step 2: Update cash balance (includes commission)
    const { data: accountRow } = await supabase
      .from("investment_accounts")
      .select("id, cash_balance")
      .match(accountFilter)
      .maybeSingle()

    if (accountRow) {
      const { error: cashError } = await supabase
        .from("investment_accounts")
        .update({
          cash_balance: accountRow.cash_balance - buyCashOutlay,
          updated_at: new Date().toISOString(),
        })
        .eq("id", accountRow.id)

      if (cashError) {
        // Rollback holding
        if (wasNewHolding) {
          await supabase.from("investments").delete().eq("id", investmentId)
        } else if (existingHolding) {
          await supabase
            .from("investments")
            .update({ units: existingHolding.units, cost_basis: existingHolding.cost_basis })
            .eq("id", existingHolding.id)
        }
        return NextResponse.json({ error: "Failed to update cash balance" }, { status: 500 })
      }
    } else {
      const { error: cashError } = await supabase
        .from("investment_accounts")
        .insert({
          family_id: resolved.familyId,
          profile_id: profileId ?? null,
          cash_balance: -buyCashOutlay,
          updated_at: new Date().toISOString(),
        })

      if (cashError) {
        if (wasNewHolding) {
          await supabase.from("investments").delete().eq("id", investmentId)
        } else if (existingHolding) {
          await supabase
            .from("investments")
            .update({ units: existingHolding.units, cost_basis: existingHolding.cost_basis })
            .eq("id", existingHolding.id)
        }
        return NextResponse.json({ error: "Failed to create cash account" }, { status: 500 })
      }
    }

    // Step 3: Insert transaction record
    const { data: transaction, error: txError } = await supabase
      .from("investment_transactions")
      .insert({
        family_id: resolved.familyId,
        investment_id: investmentId,
        symbol,
        type,
        quantity,
        price,
        commission,
        ...(journalText && { journal_text: journalText }),
        ...(screenshotUrl && { screenshot_url: screenshotUrl }),
        ...(profileId && { profile_id: profileId }),
      })
      .select()
      .single()

    if (txError) {
      // Rollback holding and cash
      if (wasNewHolding) {
        await supabase.from("investments").delete().eq("id", investmentId)
      } else if (existingHolding) {
        await supabase
          .from("investments")
          .update({ units: existingHolding.units, cost_basis: existingHolding.cost_basis })
          .eq("id", existingHolding.id)
      }
      const { data: acctRollback } = await supabase
        .from("investment_accounts")
        .select("id, cash_balance")
        .match(accountFilter)
        .maybeSingle()
      if (acctRollback) {
        await supabase
          .from("investment_accounts")
          .update({
            cash_balance: acctRollback.cash_balance + buyCashOutlay,
            updated_at: new Date().toISOString(),
          })
          .eq("id", acctRollback.id)
      }
      return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 })
    }

    return NextResponse.json(transaction, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
