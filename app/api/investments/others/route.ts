import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"

const querySchema = z.object({
  tabId: z.string().uuid(),
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
})

const createOtherSchema = z.object({
  tabId: z.string().uuid(),
  profileId: z.string().uuid(),
  familyId: z.string().uuid(),
  name: z.string().min(1).max(500),
  typeLabel: z.string().min(1).max(100),
  purchasePrice: z.number().min(0),
  currentValue: z.number().min(0).optional(),
  purchaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  brand: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  condition: z.string().max(50).optional(),
  quantity: z.number().int().min(1).optional(),
  notes: z.string().max(2000).optional(),
  imageUrl: z.string().max(2000).optional(),
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
    const parsed = querySchema.safeParse({
      tabId: searchParams.get("tabId") ?? undefined,
      profileId: searchParams.get("profileId") ?? undefined,
      familyId: searchParams.get("familyId") ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: "tabId required" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      parsed.data.profileId ?? null,
      parsed.data.familyId ?? null,
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family not found" }, { status: 404 })
    }

    let query = supabase
      .from("collectible_others")
      .select("*")
      .eq("tab_id", parsed.data.tabId)
      .eq("family_id", resolved.familyId)
      .order("created_at", { ascending: false })

    if (parsed.data.profileId) {
      query = query.eq("profile_id", parsed.data.profileId)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 })
    }

    return NextResponse.json(data ?? [])
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
    const parsed = createOtherSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      parsed.data.profileId,
      parsed.data.familyId,
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family not found" }, { status: 404 })
    }

    const { data, error } = await supabase
      .from("collectible_others")
      .insert({
        family_id: resolved.familyId,
        profile_id: parsed.data.profileId,
        tab_id: parsed.data.tabId,
        name: parsed.data.name.trim(),
        type_label: parsed.data.typeLabel,
        purchase_price: parsed.data.purchasePrice,
        current_value: parsed.data.currentValue ?? null,
        value_updated_at: parsed.data.currentValue ? new Date().toISOString() : null,
        purchase_date: parsed.data.purchaseDate ?? null,
        brand: parsed.data.brand ?? null,
        description: parsed.data.description ?? null,
        condition: parsed.data.condition ?? null,
        quantity: parsed.data.quantity ?? 1,
        notes: parsed.data.notes ?? null,
        image_url: parsed.data.imageUrl ?? null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to create item" }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
