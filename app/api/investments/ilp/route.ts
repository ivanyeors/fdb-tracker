import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const createIlpSchema = z.object({
  name: z.string().min(1),
  monthlyPremium: z.number().positive(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  profileId: z.string().uuid().optional(),
})

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const supabase = createSupabaseAdmin()

    const { data: products, error } = await supabase
      .from("ilp_products")
      .select("*")
      .eq("household_id", accountId)
      .order("created_at", { ascending: true })

    if (error) {
      return NextResponse.json({ error: "Failed to fetch ILP products" }, { status: 500 })
    }

    if (products.length === 0) {
      return NextResponse.json([])
    }

    const productIds = products.map((p) => p.id)

    const { data: allEntries, error: entriesError } = await supabase
      .from("ilp_entries")
      .select("*")
      .in("product_id", productIds)
      .order("month", { ascending: false })

    if (entriesError) {
      return NextResponse.json({ error: "Failed to fetch ILP entries" }, { status: 500 })
    }

    const latestEntryByProduct = new Map<string, (typeof allEntries)[number]>()
    for (const entry of allEntries) {
      if (!latestEntryByProduct.has(entry.product_id)) {
        latestEntryByProduct.set(entry.product_id, entry)
      }
    }

    const result = products.map((product) => ({
      ...product,
      latestEntry: latestEntryByProduct.get(product.id) ?? null,
    }))

    return NextResponse.json(result)
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
    const parsed = createIlpSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const { name, monthlyPremium, endDate, profileId } = parsed.data
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

    const { data, error } = await supabase
      .from("ilp_products")
      .insert({
        household_id: accountId,
        name,
        monthly_premium: monthlyPremium,
        end_date: endDate,
        ...(profileId && { profile_id: profileId }),
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to create ILP product" }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
