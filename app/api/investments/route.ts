import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { getStockPrice } from "@/lib/external/eulerpool"
import { calculatePnL } from "@/lib/calculations/investments"

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
    const { familyId, profileIds } = resolved
    const profileId = profileIds[0] ?? null

    let query = supabase
      .from("investments")
      .select("*")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true })

    if (profileId) {
      query = query.eq("profile_id", profileId)
    }

    const { data: investments, error } = await query

    if (error) {
      return NextResponse.json({ error: "Failed to fetch investments" }, { status: 500 })
    }

    if (!investments) return NextResponse.json([])

    const enriched = await Promise.all(
      investments.map(async (inv) => {
        try {
          const priceData = await getStockPrice(inv.symbol)
          const pnl = calculatePnL(inv.units, inv.cost_basis, priceData.price)
          return {
            ...inv,
            currentPrice: priceData.price,
            currency: priceData.currency,
            ...pnl,
          }
        } catch {
          return {
            ...inv,
            currentPrice: null,
            currency: null,
            marketValue: null,
            unrealisedPnL: null,
            unrealisedPnLPct: null,
          }
        }
      }),
    )

    return NextResponse.json(enriched)
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

    const { symbol, type, units, costBasis, profileId, familyId } = parsed.data
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

    const { data, error } = await supabase
      .from("investments")
      .insert({
        family_id: resolved.familyId,
        symbol,
        type,
        units,
        cost_basis: costBasis,
        ...(profileId && { profile_id: profileId }),
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to create investment" }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error("[api/investments] POST Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
