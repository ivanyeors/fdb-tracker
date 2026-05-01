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

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>

type AccountFilter = { family_id: string; profile_id: string | null }

type TxnInput = z.infer<typeof createTransactionSchema>

type Holding = {
  id: string
  units: number
  cost_basis: number
}

type TxnContext = {
  supabase: SupabaseAdmin
  familyId: string
  accountFilter: AccountFilter
  input: TxnInput
  amount: number
  buyCashOutlay: number
  sellCashProceeds: number
}

async function adjustCashBalance(
  supabase: SupabaseAdmin,
  accountFilter: AccountFilter,
  delta: number,
): Promise<boolean> {
  const { data: accountRow } = await supabase
    .from("investment_accounts")
    .select("id, cash_balance")
    .match(accountFilter)
    .maybeSingle()

  if (accountRow) {
    const { error } = await supabase
      .from("investment_accounts")
      .update({
        cash_balance: accountRow.cash_balance + delta,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountRow.id)
    return !error
  }

  const { error } = await supabase
    .from("investment_accounts")
    .insert({
      ...accountFilter,
      cash_balance: delta,
      updated_at: new Date().toISOString(),
    })
  return !error
}

async function restoreHoldingUnits(
  supabase: SupabaseAdmin,
  holding: Holding,
  patch: { units: number; cost_basis?: number },
): Promise<void> {
  await supabase.from("investments").update(patch).eq("id", holding.id)
}

async function fetchExistingHolding(
  supabase: SupabaseAdmin,
  familyId: string,
  symbol: string,
  profileId: string | undefined,
): Promise<Holding | null> {
  let query = supabase
    .from("investments")
    .select("*")
    .eq("family_id", familyId)
    .eq("symbol", symbol)
    .order("created_at", { ascending: true })
    .limit(1)
  if (profileId) {
    query = query.or(`profile_id.eq.${profileId},profile_id.is.null`)
  }
  const { data } = await query
  return (data?.[0] as Holding | undefined) ?? null
}

async function executeSellFlow(
  ctx: TxnContext,
  existingHolding: Holding | null,
): Promise<NextResponse> {
  const { supabase, accountFilter, familyId, input, sellCashProceeds } = ctx
  if (!existingHolding || existingHolding.units < input.quantity) {
    return NextResponse.json(
      { error: "Insufficient units to sell" },
      { status: 400 },
    )
  }

  const { error: updateError } = await supabase
    .from("investments")
    .update({ units: existingHolding.units - input.quantity })
    .eq("id", existingHolding.id)
  if (updateError) {
    return NextResponse.json({ error: "Failed to update holding" }, { status: 500 })
  }

  const cashOk = await adjustCashBalance(supabase, accountFilter, sellCashProceeds)
  if (!cashOk) {
    await restoreHoldingUnits(supabase, existingHolding, { units: existingHolding.units })
    return NextResponse.json({ error: "Failed to update cash balance" }, { status: 500 })
  }

  const { data: transaction, error: txError } = await supabase
    .from("investment_transactions")
    .insert({
      family_id: familyId,
      investment_id: existingHolding.id,
      symbol: input.symbol,
      type: "sell",
      quantity: input.quantity,
      price: input.price,
      commission: input.commission,
      ...(input.journalText && { journal_text: input.journalText }),
      ...(input.screenshotUrl && { screenshot_url: input.screenshotUrl }),
      ...(input.profileId && { profile_id: input.profileId }),
    })
    .select()
    .single()
  if (txError) {
    await restoreHoldingUnits(supabase, existingHolding, { units: existingHolding.units })
    await adjustCashBalance(supabase, accountFilter, -sellCashProceeds)
    return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 })
  }
  return NextResponse.json(transaction, { status: 201 })
}

async function executeDividendFlow(
  ctx: TxnContext,
  existingHolding: Holding | null,
): Promise<NextResponse> {
  const { supabase, accountFilter, familyId, input, amount } = ctx
  const cashOk = await adjustCashBalance(supabase, accountFilter, amount)
  if (!cashOk) {
    return NextResponse.json({ error: "Failed to update cash balance" }, { status: 500 })
  }

  const { data: transaction, error: txError } = await supabase
    .from("investment_transactions")
    .insert({
      family_id: familyId,
      investment_id: existingHolding?.id ?? null,
      symbol: input.symbol,
      type: "dividend",
      quantity: input.quantity,
      price: input.price,
      ...(input.journalText && { journal_text: input.journalText }),
      ...(input.profileId && { profile_id: input.profileId }),
    })
    .select()
    .single()
  if (txError) {
    return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 })
  }
  return NextResponse.json(transaction, { status: 201 })
}

async function upsertBuyHolding(
  ctx: TxnContext,
  existingHolding: Holding | null,
): Promise<{ investmentId: string; wasNew: boolean } | null> {
  const { supabase, familyId, input, amount } = ctx
  if (existingHolding) {
    const newCostBasis = calculateWeightedAverageCost(
      existingHolding.units,
      existingHolding.cost_basis,
      input.quantity,
      input.price,
      input.commission,
    )
    const { error } = await supabase
      .from("investments")
      .update({
        units: existingHolding.units + input.quantity,
        cost_basis: newCostBasis,
      })
      .eq("id", existingHolding.id)
    if (error) return null
    return { investmentId: existingHolding.id, wasNew: false }
  }

  const effectiveCostBasis =
    input.commission > 0 ? (amount + input.commission) / input.quantity : input.price
  const { data: newHolding, error } = await supabase
    .from("investments")
    .insert({
      family_id: familyId,
      symbol: input.symbol,
      type: "stock",
      units: input.quantity,
      cost_basis: effectiveCostBasis,
      ...(input.profileId && { profile_id: input.profileId }),
    })
    .select()
    .single()
  if (error || !newHolding) return null
  return { investmentId: newHolding.id, wasNew: true }
}

async function rollbackBuyHolding(
  supabase: SupabaseAdmin,
  investmentId: string,
  wasNew: boolean,
  existingHolding: Holding | null,
): Promise<void> {
  if (wasNew) {
    await supabase.from("investments").delete().eq("id", investmentId)
    return
  }
  if (existingHolding) {
    await restoreHoldingUnits(supabase, existingHolding, {
      units: existingHolding.units,
      cost_basis: existingHolding.cost_basis,
    })
  }
}

async function executeBuyFlow(
  ctx: TxnContext,
  existingHolding: Holding | null,
): Promise<NextResponse> {
  const { supabase, accountFilter, buyCashOutlay } = ctx
  const upsert = await upsertBuyHolding(ctx, existingHolding)
  if (!upsert) {
    return NextResponse.json(
      { error: existingHolding ? "Failed to update holding" : "Failed to create holding" },
      { status: 500 },
    )
  }

  const cashOk = await adjustCashBalance(supabase, accountFilter, -buyCashOutlay)
  if (!cashOk) {
    await rollbackBuyHolding(supabase, upsert.investmentId, upsert.wasNew, existingHolding)
    return NextResponse.json({ error: "Failed to update cash balance" }, { status: 500 })
  }

  const { input, familyId } = ctx
  const { data: transaction, error: txError } = await supabase
    .from("investment_transactions")
    .insert({
      family_id: familyId,
      investment_id: upsert.investmentId,
      symbol: input.symbol,
      type: "buy",
      quantity: input.quantity,
      price: input.price,
      commission: input.commission,
      ...(input.journalText && { journal_text: input.journalText }),
      ...(input.screenshotUrl && { screenshot_url: input.screenshotUrl }),
      ...(input.profileId && { profile_id: input.profileId }),
    })
    .select()
    .single()
  if (txError) {
    await rollbackBuyHolding(supabase, upsert.investmentId, upsert.wasNew, existingHolding)
    await adjustCashBalance(supabase, accountFilter, buyCashOutlay)
    return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 })
  }
  return NextResponse.json(transaction, { status: 201 })
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
    const input = parsed.data

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      input.profileId ?? null,
      input.familyId ?? null,
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }
    if (input.profileId && !resolved.profileIds.includes(input.profileId)) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const existingHolding = await fetchExistingHolding(
      supabase,
      resolved.familyId,
      input.symbol,
      input.profileId,
    )

    const amount = input.quantity * input.price
    const ctx: TxnContext = {
      supabase,
      familyId: resolved.familyId,
      accountFilter: {
        family_id: resolved.familyId,
        profile_id: input.profileId ?? null,
      },
      input,
      amount,
      buyCashOutlay: amount + input.commission,
      sellCashProceeds: amount - input.commission,
    }

    if (input.type === "sell") return executeSellFlow(ctx, existingHolding)
    if (input.type === "dividend") return executeDividendFlow(ctx, existingHolding)
    return executeBuyFlow(ctx, existingHolding)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
