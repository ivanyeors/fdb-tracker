import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const updateGiroRuleSchema = z.object({
  sourceBankAccountId: z.uuid().optional(),
  amount: z.number().positive().optional(),
  destinationType: z
    .enum(["outflow", "investments", "cpf_investments", "srs", "bank_account"])
    .optional(),
  destinationBankAccountId: z.uuid().nullable().optional(),
  isActive: z.boolean().optional(),
})

async function verifyGiroRuleOwnership(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  resourceId: string,
) {
  const { data: rule } = await supabase
    .from("giro_rules")
    .select("id, family_id")
    .eq("id", resourceId)
    .single()
  if (!rule) return null
  const { data: family } = await supabase
    .from("families")
    .select("id")
    .eq("id", rule.family_id)
    .eq("household_id", accountId)
    .single()
  return family ? rule : null
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
    const rule = await verifyGiroRuleOwnership(supabase, accountId, id)
    if (!rule) {
      return NextResponse.json({ error: "GIRO rule not found" }, { status: 404 })
    }

    const body = await request.json()
    const parsed = updateGiroRuleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (parsed.data.sourceBankAccountId !== undefined)
      updates.source_bank_account_id = parsed.data.sourceBankAccountId
    if (parsed.data.amount !== undefined) updates.amount = parsed.data.amount
    if (parsed.data.destinationType !== undefined)
      updates.destination_type = parsed.data.destinationType
    if (parsed.data.destinationBankAccountId !== undefined)
      updates.destination_bank_account_id = parsed.data.destinationBankAccountId
    if (parsed.data.isActive !== undefined) updates.is_active = parsed.data.isActive

    const { data, error } = await supabase
      .from("giro_rules")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: "Failed to update GIRO rule" }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    console.error("[api/giro-rules] PATCH Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
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
    const rule = await verifyGiroRuleOwnership(supabase, accountId, id)
    if (!rule) {
      return NextResponse.json({ error: "GIRO rule not found" }, { status: 404 })
    }

    const { error } = await supabase.from("giro_rules").delete().eq("id", id)
    if (error) return NextResponse.json({ error: "Failed to delete GIRO rule" }, { status: 500 })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error("[api/giro-rules] DELETE Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
