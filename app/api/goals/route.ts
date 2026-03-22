import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"

const goalsQuerySchema = z.object({
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const { searchParams } = request.nextUrl
    const parsed = goalsQuerySchema.safeParse({
      profileId: searchParams.get("profileId") ?? undefined,
      familyId: searchParams.get("familyId") ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      parsed.data.profileId ?? null,
      parsed.data.familyId ?? null
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }
    const { familyId } = resolved
    const profileId = parsed.data.profileId ?? null

    let query = supabase
      .from("savings_goals")
      .select("*, goal_contributions(id, amount, source, created_at)")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true })

    if (profileId) {
      query = query.or(`profile_id.eq.${profileId},profile_id.is.null`)
    }

    const { data: goals, error } = await query

    if (error) {
      return NextResponse.json({ error: "Failed to fetch goals" }, { status: 500 })
    }

    // Override current_amount with linked bank account balance where applicable
    if (goals && goals.length > 0) {
      const linked = goals.filter((g) => g.linked_bank_account_id)
      if (linked.length > 0) {
        const accountIds = linked.map((g) => g.linked_bank_account_id!)
        const { data: accounts } = await supabase
          .from("bank_accounts")
          .select("id, opening_balance")
          .in("id", accountIds)
        if (accounts) {
          const balanceMap = new Map(accounts.map((a) => [a.id, a.opening_balance]))
          for (const g of goals) {
            if (g.linked_bank_account_id && balanceMap.has(g.linked_bank_account_id)) {
              g.current_amount = balanceMap.get(g.linked_bank_account_id)!
            }
          }
        }
      }
    }

    return NextResponse.json(goals || [])
  } catch (err) {
    console.error("[api/goals] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

const createGoalSchema = z.object({
  name: z.string().min(1),
  targetAmount: z.number().positive(),
  currentAmount: z.number().min(0).optional(),
  monthlyAutoAmount: z.number().min(0).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  category: z
    .enum(["dream_home", "gadget", "travel", "wardrobe", "car", "custom"])
    .optional(),
  linkedBankAccountId: z.string().uuid().nullable().optional(),
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const body = await request.json()
    const parsed = createGoalSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      parsed.data.profileId ?? null,
      parsed.data.familyId ?? null
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }
    const { familyId } = resolved

    const { data: goal, error } = await supabase
      .from("savings_goals")
      .insert({
        family_id: familyId,
        name: parsed.data.name,
        target_amount: parsed.data.targetAmount,
        current_amount: parsed.data.currentAmount ?? 0,
        monthly_auto_amount: parsed.data.monthlyAutoAmount ?? 0,
        deadline: parsed.data.deadline ?? null,
        category: parsed.data.category ?? "custom",
        linked_bank_account_id: parsed.data.linkedBankAccountId ?? null,
        ...(parsed.data.profileId && { profile_id: parsed.data.profileId }),
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to create savings goal" }, { status: 500 })
    }
    return NextResponse.json(goal, { status: 201 })
  } catch (err) {
    console.error("[api/goals] POST Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
