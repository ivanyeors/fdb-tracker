import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { encodeBankAccountPiiPatch } from "@/lib/repos/bank-accounts"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { z } from "zod"
import { bankAccountSchema } from "@/lib/validations/onboarding"

const savingsGoalSchema = z.object({
  name: z.string().default(""),
  target_amount: z.number().min(0).nullable().optional().default(0),
  current_amount: z.number().min(0).optional().default(0),
  deadline: z
    .union([
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      z.literal(""),
      z.null(),
      z.undefined(),
    ])
    .optional()
    .transform((v) => (v === "" || v == null || v === undefined ? null : v)),
})

const banksRouteSchema = z.object({
  mode: z.enum(["first-time", "new-family", "resume"]).optional().default("first-time"),
  familyId: z.string().uuid().optional(),
  bankAccounts: z.array(
    bankAccountSchema
      .omit({ profile_id: true })
      .extend({
        profileIndex: z.number().int().min(0).optional().default(0),
        opening_balance: z.number().min(0).optional(),
        savings_goals: z.array(savingsGoalSchema).optional().default([]),
      }),
  ),
})

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const parsed = banksRouteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", message: parsed.error.message },
        { status: 400 },
      )
    }

    const { familyId: bodyFamilyId, bankAccounts } = parsed.data
    const supabase = createSupabaseAdmin()

    let familyId = bodyFamilyId
    if (!familyId) {
      const { data: fam } = await supabase
        .from("families")
        .select("id")
        .eq("household_id", session.accountId)
        .order("created_at", { ascending: true })
        .limit(1)
        .single()
      if (!fam) {
        return NextResponse.json(
          { error: "No family found. Complete users and profiles steps first." },
          { status: 400 },
        )
      }
      familyId = fam.id
    }

    const validAccounts = bankAccounts.filter(
      (acc) => (acc.bank_name?.trim() ?? "").length > 0,
    )

    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true })

    const profiles = profileRows ?? []

    await supabase
      .from("bank_accounts")
      .delete()
      .eq("family_id", familyId)

    for (const acc of validAccounts) {
      const profileId = profiles[acc.profileIndex ?? 0]?.id ?? null

      const { data: insertedAcc, error: accError } = await supabase
        .from("bank_accounts")
        .insert({
          family_id: familyId,
          bank_name: acc.bank_name,
          account_type: acc.account_type,
          account_number: acc.account_number ?? null,
          ...encodeBankAccountPiiPatch({
            account_number: acc.account_number ?? null,
          }),
          profile_id: profileId,
          opening_balance: acc.opening_balance ?? 0,
        })
        .select("id")
        .single()

      if (accError) {
        console.error("Onboarding banks insert error:", accError)
        return NextResponse.json(
          { error: "Failed to save bank accounts" },
          { status: 500 },
        )
      }

      const validGoals = (acc.savings_goals ?? []).filter(
        (g) =>
          (g.name?.trim() ?? "").length > 0 && (g.target_amount ?? 0) > 0,
      )
      if (insertedAcc && validGoals.length > 0) {
        await supabase.from("savings_goals").insert(
          validGoals.map((g) => ({
            family_id: familyId,
            profile_id: profileId,
            name: g.name ?? "",
            target_amount: g.target_amount ?? 0,
            current_amount: g.current_amount ?? 0,
            deadline: g.deadline ?? null,
            category: "custom",
          })),
        )
      }
    }

    return NextResponse.json({ success: true, familyId })
  } catch (error) {
    console.error("Onboarding banks error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
