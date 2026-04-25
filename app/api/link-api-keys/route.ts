import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireSuperAdmin } from "@/lib/auth/admin"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import {
  generateApiKey,
  countLinkedMembers,
} from "@/lib/auth/api-keys"

const createBodySchema = z.object({
  name: z.string().max(100).optional(),
  maxMembers: z.number().int().min(1).max(100).optional(),
})

export async function GET() {
  try {
    const auth = await requireSuperAdmin()
    if ("response" in auth) return auth.response
    const { session } = auth

    const supabase = createSupabaseAdmin()
    const { data: keys, error } = await supabase
      .from("link_api_keys")
      .select("id, key_prefix, name, max_members, created_at")
      .eq("household_id", session.accountId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[link-api-keys] GET error:", error)
      return NextResponse.json({ error: "Failed to fetch API keys" }, { status: 500 })
    }

    const withCounts = await Promise.all(
      (keys ?? []).map(async (k) => {
        const linkedCount = await countLinkedMembers(k.id)
        return {
          id: k.id,
          prefix: k.key_prefix,
          name: k.name ?? null,
          maxMembers: k.max_members,
          linkedCount,
          createdAt: k.created_at,
        }
      }),
    )

    return NextResponse.json(withCounts)
  } catch (err) {
    console.error("[link-api-keys] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin()
    if ("response" in auth) return auth.response
    const { session } = auth

    const body = await request.json()
    const parsed = createBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const { rawKey, hash, prefix } = await generateApiKey()
    const maxMembers = parsed.data.maxMembers ?? 10

    const supabase = createSupabaseAdmin()
    const { data: inserted, error } = await supabase
      .from("link_api_keys")
      .insert({
        household_id: session.accountId,
        api_key_hash: hash,
        key_prefix: prefix,
        name: parsed.data.name ?? null,
        max_members: maxMembers,
      })
      .select("id")
      .single()

    if (error || !inserted) {
      console.error("[link-api-keys] POST insert error:", error)
      return NextResponse.json({ error: "Failed to create API key" }, { status: 500 })
    }

    return NextResponse.json(
      {
        id: inserted.id,
        rawKey,
        prefix,
        maxMembers,
      },
      { status: 201 },
    )
  } catch (err) {
    console.error("[link-api-keys] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
