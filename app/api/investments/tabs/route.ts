import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"

const querySchema = z.object({
  familyId: z.uuid(),
})

const createTabSchema = z.object({
  familyId: z.uuid(),
  tabType: z.enum(["cards", "others"]),
  tabLabel: z.string().min(1).max(100).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const parsed = querySchema.safeParse({
      familyId: request.nextUrl.searchParams.get("familyId"),
    })
    if (!parsed.success) {
      return NextResponse.json({ error: "familyId required" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      null,
      parsed.data.familyId,
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family not found" }, { status: 404 })
    }

    const { data, error } = await supabase
      .from("investment_tabs")
      .select("*")
      .eq("family_id", resolved.familyId)
      .eq("is_visible", true)
      .order("sort_order", { ascending: true })

    if (error) {
      return NextResponse.json({ error: "Failed to fetch tabs" }, { status: 500 })
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
    const parsed = createTabSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      null,
      parsed.data.familyId,
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family not found" }, { status: 404 })
    }

    const defaultLabel = parsed.data.tabType === "cards" ? "Cards" : "Others"

    const { data, error } = await supabase
      .from("investment_tabs")
      .insert({
        family_id: resolved.familyId,
        tab_type: parsed.data.tabType,
        tab_label: parsed.data.tabLabel?.trim() || defaultLabel,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to create tab" }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
