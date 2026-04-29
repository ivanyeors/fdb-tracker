import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"

const updateOtherSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  typeLabel: z.string().min(1).max(100).optional(),
  purchasePrice: z.number().min(0).optional(),
  currentValue: z.number().min(0).nullable().optional(),
  purchaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  brand: z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  condition: z.string().max(50).nullable().optional(),
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

    const { data: item } = await supabase
      .from("collectible_others")
      .select("family_id")
      .eq("id", id)
      .single()

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      null,
      item.family_id,
    )
    if (!resolved) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const body = await request.json()
    const parsed = updateOtherSchema.safeParse(body)
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
    if (d.brand !== undefined) updates.brand = d.brand
    if (d.description !== undefined) updates.description = d.description
    if (d.condition !== undefined) updates.condition = d.condition
    if (d.quantity !== undefined) updates.quantity = d.quantity
    if (d.notes !== undefined) updates.notes = d.notes
    if (d.imageUrl !== undefined) updates.image_url = d.imageUrl

    const { data, error } = await supabase
      .from("collectible_others")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to update item" }, { status: 500 })
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

    const { data: item } = await supabase
      .from("collectible_others")
      .select("family_id")
      .eq("id", id)
      .single()

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      null,
      item.family_id,
    )
    if (!resolved) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const { error } = await supabase
      .from("collectible_others")
      .delete()
      .eq("id", id)

    if (error) {
      return NextResponse.json({ error: "Failed to delete item" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
