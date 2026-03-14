import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

import { z } from "zod"
import {
  bankAccountSchema,
  promptScheduleSchema,
} from "@/lib/validations/onboarding"

// Relaxed schemas for complete endpoint - client may send null/partial data
const completeProfileSchema = z.object({
  name: z.string().min(1).max(50),
  birth_year: z
    .number()
    .int()
    .min(1940)
    .max(2010)
    .nullable()
    .optional()
    .transform((v) => (v ?? 1990)),
})

const completeIncomeSchema = z.object({
  annual_salary: z.number().min(0).nullable().optional().default(0),
  bonus_estimate: z.number().min(0).nullable().optional().default(0),
  pay_frequency: z.enum(["monthly", "bi-monthly", "weekly"]),
})

const completeSavingsGoalSchema = z.object({
  name: z.string().default(""),
  target_amount: z.number().min(0).nullable().optional().default(0),
  current_amount: z.number().min(0).default(0),
  deadline: z
    .union([
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      z.literal(""),
      z.null(),
    ])
    .optional()
    .transform((v) => (v === "" || v == null ? null : v)),
})

const completeSchema = z.object({
  userCount: z.number().int().min(1).max(6),
  profiles: z.array(completeProfileSchema).min(1).max(6),
  incomeConfigs: z.array(completeIncomeSchema),
  bankAccounts: z.array(
    bankAccountSchema
      .omit({ profile_id: true })
      .extend({
        profile_id: z.string().uuid().nullable().optional(),
        savings_goals: z.array(completeSavingsGoalSchema),
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
      return NextResponse.json(
        {
          error: "Invalid data",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
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
    
    // Insert Income Configs (only for profiles with valid config)
    const incomeInserts = data.incomeConfigs
      .slice(0, insertedProfiles.length)
      .map((ic, idx) => ({
        profile_id: insertedProfiles[idx].id,
        annual_salary: ic.annual_salary ?? 0,
        bonus_estimate: ic.bonus_estimate ?? 0,
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
        const validGoals = acc.savings_goals.filter(
          (g) =>
            (g.name?.trim() ?? "").length > 0 && (g.target_amount ?? 0) > 0,
        )
        if (validGoals.length > 0) {
          await supabase.from("savings_goals").insert(
            validGoals.map((g) => ({
              household_id: session.accountId,
              profile_id: acc.profile_id ?? null,
              name: g.name ?? "",
              target_amount: g.target_amount ?? 0,
              current_amount: g.current_amount ?? 0,
              deadline: g.deadline ?? null,
              category: "custom",
            })),
          )
        }
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
