import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"

const updateCardSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  typeLabel: z.string().min(1).max(100).optional(),
  purchasePrice: z.number().min(0).optional(),
  currentValue: z.number().min(0).nullable().optional(),
  purchaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  setName: z.string().max(300).nullable().optional(),
  franchise: z.string().max(100).nullable().optional(),
  language: z.string().max(50).nullable().optional(),
  edition: z.string().max(100).nullable().optional(),
  cardNumber: z.string().max(50).nullable().optional(),
  gradingCompany: z.string().max(50).nullable().optional(),
  grade: z.number().min(0).max(10).nullable().optional(),
  certNumber: z.string().max(100).nullable().optional(),
  condition: z.string().max(50).nullable().optional(),
  rarity: z.string().max(100).nullable().optional(),
  quantity: z.number().int().min(1).optional(),
  notes: z.string().max(2000).nullable().optional(),
  imageUrl: z.string().max(2000).nullable().optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const supabase = createSupabaseAdmin()

    const { data: card } = await supabase
      .from("collectible_cards")
      .select("family_id")
      .eq("id", id)
      .single()

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 })
    }

    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      null,
      card.family_id,
    )
    if (!resolved) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const body = await request.json()
    const parsed = updateCardSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const d = parsed.data
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (d.name !== undefined) updates.name = d.name.trim()
    if (d.typeLabel !== undefined) updates.type_label = d.typeLabel
    if (d.purchasePrice !== undefined) updates.purchase_price = d.purchasePrice
    if (d.currentValue !== undefined) {
      updates.current_value = d.currentValue
      updates.value_updated_at = d.currentValue === null ? null : new Date().toISOString()
    }
    if (d.purchaseDate !== undefined) updates.purchase_date = d.purchaseDate
    if (d.setName !== undefined) updates.set_name = d.setName
    if (d.franchise !== undefined) updates.franchise = d.franchise
    if (d.language !== undefined) updates.language = d.language
    if (d.edition !== undefined) updates.edition = d.edition
    if (d.cardNumber !== undefined) updates.card_number = d.cardNumber
    if (d.gradingCompany !== undefined) updates.grading_company = d.gradingCompany
    if (d.grade !== undefined) updates.grade = d.grade
    if (d.certNumber !== undefined) updates.cert_number = d.certNumber
    if (d.condition !== undefined) updates.condition = d.condition
    if (d.rarity !== undefined) updates.rarity = d.rarity
    if (d.quantity !== undefined) updates.quantity = d.quantity
    if (d.notes !== undefined) updates.notes = d.notes
    if (d.imageUrl !== undefined) updates.image_url = d.imageUrl

    const { data, error } = await supabase
      .from("collectible_cards")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to update card" }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const supabase = createSupabaseAdmin()

    const { data: card } = await supabase
      .from("collectible_cards")
      .select("family_id")
      .eq("id", id)
      .single()

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 })
    }

    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      null,
      card.family_id,
    )
    if (!resolved) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const { error } = await supabase
      .from("collectible_cards")
      .delete()
      .eq("id", id)

    if (error) {
      return NextResponse.json({ error: "Failed to delete card" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
