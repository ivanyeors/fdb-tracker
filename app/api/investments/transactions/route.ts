import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { calculateWeightedAverageCost } from "@/lib/calculations/investments"

const transactionQuerySchema = z.object({
  symbol: z.string().optional(),
  type: z.enum(["buy", "sell"]).optional(),
  profileId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

const createTransactionSchema = z.object({
  symbol: z.string().min(1),
  type: z.enum(["buy", "sell"]),
  quantity: z.number().positive(),
  price: z.number().min(0),
  journalText: z.string().optional(),
  screenshotUrl: z.string().url().optional(),
  profileId: z.string().uuid().optional(),
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
      limit: searchParams.get("limit") ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const { symbol, type, profileId, limit = 50 } = parsed.data
    const supabase = createSupabaseAdmin()

    let query = supabase
      .from("investment_transactions")
      .select("*")
      .eq("household_id", accountId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (symbol) query = query.eq("symbol", symbol)
    if (type) query = query.eq("type", type)
    if (profileId) query = query.eq("profile_id", profileId)

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 })
    }

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

    const { symbol, type, quantity, price, journalText, screenshotUrl, profileId } = parsed.data
    const supabase = createSupabaseAdmin()

    if (profileId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", profileId)
        .eq("household_id", accountId)
        .single()

      if (!profile) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 })
      }
    }

    const { data: existingHolding } = await supabase
      .from("investments")
      .select("*")
      .eq("household_id", accountId)
      .eq("symbol", symbol)
      .maybeSingle()

    if (type === "sell") {
      if (!existingHolding || existingHolding.units < quantity) {
        return NextResponse.json(
          { error: "Insufficient units to sell" },
          { status: 400 },
        )
      }

      const newUnits = existingHolding.units - quantity

      const { error: updateError } = await supabase
        .from("investments")
        .update({ units: newUnits })
        .eq("id", existingHolding.id)

      if (updateError) {
        return NextResponse.json({ error: "Failed to update holding" }, { status: 500 })
      }

      const { data: transaction, error: txError } = await supabase
        .from("investment_transactions")
        .insert({
          household_id: accountId,
          investment_id: existingHolding.id,
          symbol,
          type,
          quantity,
          price,
          ...(journalText && { journal_text: journalText }),
          ...(screenshotUrl && { screenshot_url: screenshotUrl }),
          ...(profileId && { profile_id: profileId }),
        })
        .select()
        .single()

      if (txError) {
        return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 })
      }

      return NextResponse.json(transaction, { status: 201 })
    }

    let investmentId: string

    if (existingHolding) {
      const newCostBasis = calculateWeightedAverageCost(
        existingHolding.units,
        existingHolding.cost_basis,
        quantity,
        price,
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
      const { data: newHolding, error: insertError } = await supabase
        .from("investments")
        .insert({
          household_id: accountId,
          symbol,
          type: "stock",
          units: quantity,
          cost_basis: price,
          ...(profileId && { profile_id: profileId }),
        })
        .select()
        .single()

      if (insertError || !newHolding) {
        return NextResponse.json({ error: "Failed to create holding" }, { status: 500 })
      }

      investmentId = newHolding.id
    }

    const { data: transaction, error: txError } = await supabase
      .from("investment_transactions")
      .insert({
        household_id: accountId,
        investment_id: investmentId,
        symbol,
        type,
        quantity,
        price,
        ...(journalText && { journal_text: journalText }),
        ...(screenshotUrl && { screenshot_url: screenshotUrl }),
        ...(profileId && { profile_id: profileId }),
      })
      .select()
      .single()

    if (txError) {
      return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 })
    }

    return NextResponse.json(transaction, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
