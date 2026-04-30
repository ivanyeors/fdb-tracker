import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"

const giroRulesQuerySchema = z.object({
  profileId: z.uuid().optional(),
  familyId: z.uuid().optional(),
})

const createGiroRuleSchema = z.object({
  familyId: z.uuid(),
  profileId: z.uuid().optional(),
  sourceBankAccountId: z.uuid(),
  amount: z.number().positive(),
  destinationType: z.enum([
    "outflow",
    "investments",
    "cpf_investments",
    "srs",
    "bank_account",
  ]),
  destinationBankAccountId: z.uuid().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = request.nextUrl
    const parsed = giroRulesQuerySchema.safeParse({
      profileId: searchParams.get("profileId") ?? undefined,
      familyId: searchParams.get("familyId") ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }
    if (!parsed.data.profileId && !parsed.data.familyId) {
      return NextResponse.json(
        { error: "profileId or familyId required" },
        { status: 400 },
      )
    }

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      session.accountId,
      parsed.data.profileId ?? null,
      parsed.data.familyId ?? null,
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }
    const { familyId } = resolved

    const { data: rules, error } = await supabase
      .from("giro_rules")
      .select("*")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true })

    if (error) {
      return NextResponse.json({ error: "Failed to fetch GIRO rules" }, { status: 500 })
    }

    return NextResponse.json(rules ?? [])
  } catch (err) {
    console.error("[api/giro-rules] GET Error:", err)
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
    const parsed = createGiroRuleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: z.flattenError(parsed.error) },
        { status: 400 },
      )
    }

    const {
      familyId,
      profileId,
      sourceBankAccountId,
      amount,
      destinationType,
      destinationBankAccountId,
    } = parsed.data

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      null,
      familyId,
    )
    if (resolved?.familyId !== familyId) {
      return NextResponse.json({ error: "Family not found" }, { status: 404 })
    }

    if (destinationType === "bank_account" && !destinationBankAccountId) {
      return NextResponse.json(
        { error: "destinationBankAccountId required when destinationType is bank_account" },
        { status: 400 },
      )
    }

    const { data: sourceAccount } = await supabase
      .from("bank_accounts")
      .select("id, family_id")
      .eq("id", sourceBankAccountId)
      .single()
    if (sourceAccount?.family_id !== familyId) {
      return NextResponse.json({ error: "Source bank account not found" }, { status: 404 })
    }

    if (destinationBankAccountId) {
      const { data: destAccount } = await supabase
        .from("bank_accounts")
        .select("id, family_id")
        .eq("id", destinationBankAccountId)
        .single()
      if (destAccount?.family_id !== familyId) {
        return NextResponse.json(
          { error: "Destination bank account not found" },
          { status: 404 },
        )
      }
    }

    const { data: rule, error } = await supabase
      .from("giro_rules")
      .insert({
        family_id: familyId,
        profile_id: profileId ?? null,
        source_bank_account_id: sourceBankAccountId,
        amount,
        destination_type: destinationType,
        destination_bank_account_id:
          destinationType === "bank_account" ? destinationBankAccountId : null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to create GIRO rule" }, { status: 500 })
    }
    return NextResponse.json(rule, { status: 201 })
  } catch (err) {
    console.error("[api/giro-rules] POST Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
