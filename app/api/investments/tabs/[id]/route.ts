import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"

const updateTabSchema = z.object({
  tabLabel: z.string().min(1).max(100).optional(),
  sortOrder: z.number().int().optional(),
  isVisible: z.boolean().optional(),
})

export async function PATCH(
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

    const body = await request.json()
    const parsed = updateTabSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()

    const { data: tab } = await supabase
      .from("investment_tabs")
      .select("family_id")
      .eq("id", id)
      .single()

    if (!tab) {
      return NextResponse.json({ error: "Tab not found" }, { status: 404 })
    }

    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      null,
      tab.family_id,
    )
    if (!resolved) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const updates: Record<string, unknown> = {}
    if (parsed.data.tabLabel !== undefined) updates.tab_label = parsed.data.tabLabel.trim()
    if (parsed.data.sortOrder !== undefined) updates.sort_order = parsed.data.sortOrder
    if (parsed.data.isVisible !== undefined) updates.is_visible = parsed.data.isVisible

    const { data, error } = await supabase
      .from("investment_tabs")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to update tab" }, { status: 500 })
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

    const { data: tab } = await supabase
      .from("investment_tabs")
      .select("family_id")
      .eq("id", id)
      .single()

    if (!tab) {
      return NextResponse.json({ error: "Tab not found" }, { status: 404 })
    }

    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      null,
      tab.family_id,
    )
    if (!resolved) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const { error } = await supabase
      .from("investment_tabs")
      .delete()
      .eq("id", id)

    if (error) {
      return NextResponse.json({ error: "Failed to delete tab" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
