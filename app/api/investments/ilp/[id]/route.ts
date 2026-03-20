import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"

const updateIlpSchema = z.object({
  name: z.string().min(1).optional(),
  monthlyPremium: z.number().positive().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

async function verifyIlpOwnership(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  productId: string,
  familyId?: string | null,
) {
  const resolved = await resolveFamilyAndProfiles(
    supabase,
    accountId,
    null,
    familyId ?? null,
  )
  if (!resolved) return null

  const { data: product } = await supabase
    .from("ilp_products")
    .select("id")
    .eq("id", productId)
    .eq("family_id", resolved.familyId)
    .single()

  return product
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const { id } = await params
    const supabase = createSupabaseAdmin()

    const body = await request.json()
    const familyId = body.familyId as string | undefined
    const product = await verifyIlpOwnership(supabase, accountId, id, familyId)
    if (!product) {
      return NextResponse.json({ error: "ILP product not found" }, { status: 404 })
    }

    const parsed = updateIlpSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (parsed.data.name !== undefined) updates.name = parsed.data.name
    if (parsed.data.monthlyPremium !== undefined)
      updates.monthly_premium = parsed.data.monthlyPremium
    if (parsed.data.endDate !== undefined) updates.end_date = parsed.data.endDate

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("ilp_products")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to update ILP product" }, { status: 500 })
    }
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const body = await request.json().catch(() => ({}))
    const familyId =
      typeof body === "object" &&
      body !== null &&
      "familyId" in body &&
      typeof (body as { familyId?: unknown }).familyId === "string"
        ? (body as { familyId: string }).familyId
        : undefined

    const { id } = await params
    const supabase = createSupabaseAdmin()

    const product = await verifyIlpOwnership(supabase, accountId, id, familyId)
    if (!product) {
      return NextResponse.json({ error: "ILP product not found" }, { status: 404 })
    }

    const { error } = await supabase.from("ilp_products").delete().eq("id", id)
    if (error) {
      return NextResponse.json({ error: "Failed to delete ILP product" }, { status: 500 })
    }
    return new NextResponse(null, { status: 204 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
