import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireSuperAdmin } from "@/lib/auth/admin"
import { decodeProfilePii } from "@/lib/repos/profiles"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const uuidSchema = z.string().uuid()
const patchSchema = z.object({ isSuperAdmin: z.boolean() })

interface AdminHouseholdView {
  id: string
  accountType: string
  isSuperAdmin: boolean
  createdAt: string
  primaryProfileName: string | null
}

async function loadHouseholdView(
  id: string
): Promise<AdminHouseholdView | null> {
  const supabase = createSupabaseAdmin()

  const { data: household } = await supabase
    .from("households")
    .select("id, account_type, is_super_admin, created_at")
    .eq("id", id)
    .maybeSingle()

  if (!household) return null

  const { data: family } = await supabase
    .from("families")
    .select("id")
    .eq("household_id", household.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  let primaryProfileName: string | null = null
  if (family) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, name_enc")
      .eq("family_id", family.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (profile) {
      primaryProfileName = decodeProfilePii({
        name: profile.name,
        name_enc: profile.name_enc,
      }).name
    }
  }

  return {
    id: household.id,
    accountType: household.account_type,
    isSuperAdmin: household.is_super_admin,
    createdAt: household.created_at,
    primaryProfileName,
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin()
  if ("response" in auth) return auth.response

  const { id: rawId } = await params
  const parsed = uuidSchema.safeParse(rawId)
  if (!parsed.success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const view = await loadHouseholdView(parsed.data)
  if (!view) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json(view)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin()
  if ("response" in auth) return auth.response
  const { session } = auth

  const { id: rawId } = await params
  const parsedId = uuidSchema.safeParse(rawId)
  if (!parsedId.success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  const parsedBody = patchSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }

  const targetId = parsedId.data
  const { isSuperAdmin } = parsedBody.data

  if (targetId === session.accountId && !isSuperAdmin) {
    return NextResponse.json(
      { error: "You cannot remove your own super-admin role." },
      { status: 400 }
    )
  }

  const supabase = createSupabaseAdmin()
  const { error } = await supabase
    .from("households")
    .update({ is_super_admin: isSuperAdmin })
    .eq("id", targetId)

  if (error) {
    console.error("[admin/households] PATCH error:", error)
    return NextResponse.json(
      { error: "Failed to update household" },
      { status: 500 }
    )
  }

  console.log(
    "[admin/households] role change",
    JSON.stringify({
      actor: session.accountId,
      target: targetId,
      isSuperAdmin,
    })
  )

  const view = await loadHouseholdView(targetId)
  if (!view) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  return NextResponse.json(view)
}
