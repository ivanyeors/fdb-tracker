import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import {
  decodeTaxReliefInputsPii,
  encodeTaxReliefInputsPiiPatch,
} from "@/lib/repos/tax-relief-inputs"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"

const RELIEF_TYPES = [
  "srs",
  "donations",
  "course_fees",
  "cpf_topup_self",
  "cpf_topup_family",
  "parent",
  "spouse",
  "wmcr",
  "other",
] as const

const reliefItemSchema = z.object({
  profile_id: z.uuid(),
  year: z.number().int().min(2020).max(2040),
  relief_type: z.enum(RELIEF_TYPES),
  amount: z.number().min(0),
})

const getQuerySchema = z.object({
  profileId: z.uuid().optional(),
  familyId: z.uuid().optional(),
  year: z.coerce.number().int().min(2020).max(2040).optional(),
})

const putBodySchema = z.object({
  reliefs: z.array(reliefItemSchema).min(1).max(50),
})

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const parsed = getQuerySchema.safeParse({
      profileId: request.nextUrl.searchParams.get("profileId") ?? undefined,
      familyId: request.nextUrl.searchParams.get("familyId") ?? undefined,
      year: request.nextUrl.searchParams.get("year") ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }
    if (!parsed.data.profileId && !parsed.data.familyId) {
      return NextResponse.json({ error: "profileId or familyId required" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      session.accountId,
      parsed.data.profileId ?? null,
      parsed.data.familyId ?? null
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }

    const year = parsed.data.year ?? new Date().getFullYear()

    const { data, error } = await supabase
      .from("tax_relief_inputs")
      .select("*")
      .in("profile_id", resolved.profileIds)
      .eq("year", year)
      .order("relief_type")

    if (error) {
      return NextResponse.json({ error: "Failed to fetch reliefs" }, { status: 500 })
    }

    const reliefs = (data ?? []).map((r) => ({
      ...r,
      amount: decodeTaxReliefInputsPii(r).amount ?? 0,
    }))
    return NextResponse.json({ reliefs })
  } catch (err) {
    console.error("[api/tax/reliefs] GET Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const parsed = putBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()

    for (const rel of parsed.data.reliefs) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, family_id")
        .eq("id", rel.profile_id)
        .single()

      if (!profile) continue

      const { data: family } = await supabase
        .from("families")
        .select("id")
        .eq("id", profile.family_id)
        .eq("household_id", session.accountId)
        .single()

      if (!family) continue

      const { error } = await supabase
        .from("tax_relief_inputs")
        .upsert(
          {
            profile_id: rel.profile_id,
            year: rel.year,
            relief_type: rel.relief_type,
            ...encodeTaxReliefInputsPiiPatch({ amount: rel.amount }),
          },
          { onConflict: "profile_id,year,relief_type" }
        )

      if (error) {
        console.error("[api/tax/reliefs] PUT upsert error:", error)
        return NextResponse.json({ error: "Failed to save relief" }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[api/tax/reliefs] PUT Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
