import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"

const querySchema = z.object({
  familyId: z.string().uuid(),
})

const createGroupSchema = z.object({
  familyId: z.string().uuid(),
  name: z.string().min(1).max(200),
  profileId: z.string().uuid().optional(),
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
      .from("ilp_fund_groups")
      .select("id, name, profile_id, created_at")
      .eq("family_id", resolved.familyId)
      .order("name", { ascending: true })

    if (error) {
      return NextResponse.json({ error: "Failed to list groups" }, { status: 500 })
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
    const parsed = createGroupSchema.safeParse(body)
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

    const { data, error } = await supabase
      .from("ilp_fund_groups")
      .insert({
        family_id: resolved.familyId,
        name: parsed.data.name.trim(),
        ...(parsed.data.profileId ? { profile_id: parsed.data.profileId } : {}),
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to create group" }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
