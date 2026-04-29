import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"

const createEntrySchema = z.object({
  productId: z.uuid(),
  familyId: z.uuid().optional(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fundValue: z.number().min(0),
  premiumsPaid: z.number().min(0).nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const bodyRaw = await request.json()
    if (!bodyRaw || typeof bodyRaw !== "object") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }
    const premiumsPaidProvided = "premiumsPaid" in bodyRaw
    const parsed = createEntrySchema.safeParse(bodyRaw)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const { productId, familyId, month, fundValue, premiumsPaid } = parsed.data
    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      null,
      familyId ?? null
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }

    const { data: product } = await supabase
      .from("ilp_products")
      .select("id")
      .eq("id", productId)
      .eq("family_id", resolved.familyId)
      .single()

    if (!product) {
      return NextResponse.json({ error: "ILP product not found" }, { status: 404 })
    }

    const upsertRow: {
      product_id: string
      month: string
      fund_value: number
      premiums_paid?: number | null
    } = {
      product_id: productId,
      month,
      fund_value: fundValue,
    }
    if (premiumsPaidProvided) {
      upsertRow.premiums_paid = premiumsPaid ?? null
    }

    const { data, error } = await supabase
      .from("ilp_entries")
      .upsert(upsertRow, { onConflict: "product_id,month" })
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
