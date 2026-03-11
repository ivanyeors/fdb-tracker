import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

import { z } from "zod"
import {
  profilesSchema,
  incomeSchema,
  bankAccountSchema,
  savingsGoalSchema,
  promptScheduleSchema,
} from "@/lib/validations/onboarding"

const completeSchema = z.object({
  userCount: z.number().int().min(1).max(6),
  profiles: profilesSchema.shape.profiles,
  incomeConfigs: z.array(incomeSchema),
  bankAccounts: z.array(
    bankAccountSchema.extend({
      savings_goals: z.array(savingsGoalSchema),
    }),
  ),
  telegramChatId: z.string(),
  promptSchedule: z.array(promptScheduleSchema),
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
    const parsed = completeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 })
    }
    
    const data = parsed.data
    const supabase = createSupabaseAdmin()
    
    // Update household
    const { error: householdError } = await supabase
      .from("households")
      .update({ 
        user_count: data.userCount,
        telegram_chat_id: data.telegramChatId || null,
        onboarding_completed_at: new Date().toISOString() 
      })
      .eq("id", session.accountId)

    if (householdError) {
      return NextResponse.json(
        { error: "Failed to update household" },
        { status: 500 },
      )
    }

    // Insert Profiles
    const { data: insertedProfiles, error: profileError } = await supabase
      .from("profiles")
      .insert(
        data.profiles.map(p => ({
          household_id: session.accountId,
          name: p.name,
          birth_year: p.birth_year,
        }))
      )
      .select("id")
      
    if (profileError || !insertedProfiles) {
      return NextResponse.json({ error: "Failed to create profiles" }, { status: 500 })
    }
    
    // Insert Income Configs
    const incomeInserts = data.incomeConfigs.map((ic, idx) => ({
      profile_id: insertedProfiles[idx].id,
      annual_salary: ic.annual_salary,
      bonus_estimate: ic.bonus_estimate,
      pay_frequency: ic.pay_frequency,
    }))
    await supabase.from("income_config").insert(incomeInserts)
    
    // Insert Bank Accounts & Goals
    for (const acc of data.bankAccounts) {
      const { data: insertedAcc } = await supabase
        .from("bank_accounts")
        .insert({
          household_id: session.accountId,
          bank_name: acc.bank_name,
          account_type: acc.account_type,
          profile_id: acc.profile_id ?? null,
        })
        .select("id")
        .single()
        
      if (insertedAcc && acc.savings_goals.length > 0) {
        await supabase.from("savings_goals").insert(
          acc.savings_goals.map(g => ({
            household_id: session.accountId,
            profile_id: acc.profile_id ?? null,
            name: g.name,
            target_amount: g.target_amount,
            current_amount: g.current_amount,
            deadline: g.deadline ?? null,
            category: "custom",
          }))
        )
      }
    }
    
    // Insert Prompt Schedule
    if (data.promptSchedule.length > 0) {
      await supabase.from("prompt_schedule").insert(
        data.promptSchedule.map(s => ({
          household_id: session.accountId,
          prompt_type: s.prompt_type,
          frequency: s.frequency,
          day_of_month: s.day_of_month,
          month_of_year: s.month_of_year,
          time: s.time,
          timezone: s.timezone,
        }))
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Onboarding error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
