import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const createEntrySchema = z.object({
  productId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fundValue: z.number().min(0),
})

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { householdId } = session

    const body = await request.json()
    const parsed = createEntrySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const { productId, month, fundValue } = parsed.data
    const supabase = createSupabaseAdmin()

    const { data: product } = await supabase
      .from("ilp_products")
      .select("id")
      .eq("id", productId)
      .eq("household_id", householdId)
      .single()

    if (!product) {
      return NextResponse.json({ error: "ILP product not found" }, { status: 404 })
    }

    const { data, error } = await supabase
      .from("ilp_entries")
      .upsert(
        {
          product_id: productId,
          month,
          fund_value: fundValue,
        },
        { onConflict: "product_id,month" },
      )
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to upsert ILP entry" }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
