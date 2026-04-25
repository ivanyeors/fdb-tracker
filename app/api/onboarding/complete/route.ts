import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, createSession, COOKIE_NAME } from "@/lib/auth/session"
import { encodeFamilyPiiPatch } from "@/lib/repos/families"
import { encodeHouseholdPiiPatch } from "@/lib/repos/households"
import { encodeLoanPiiPatch } from "@/lib/repos/loans"
import { encodeProfilePiiPatch } from "@/lib/repos/profiles"
import { createSupabaseAdmin } from "@/lib/supabase/server"

import { z } from "zod"
import { bankAccountSchema } from "@/lib/validations/onboarding"

const completePromptScheduleSchema = z.object({
  prompt_type: z.enum(["end_of_month", "income", "insurance", "tax"]),
  frequency: z.enum(["monthly", "yearly"]),
  day_of_month: z.number().int().min(1).max(31),
  month_of_year: z.number().int().min(1).max(12).nullable().optional(),
  time: z.string(),
  timezone: z.string(),
})

// Relaxed schemas for complete endpoint - client may send null/partial data
const completeProfileSchema = z.object({
  name: z
    .string()
    .max(50)
    .optional()
    .default("")
    .transform((s) => (s?.trim()?.length ? s.trim() : "Person"))
    .pipe(z.string().min(1)),
  birth_year: z
    .number()
    .int()
    .min(1940)
    .max(2010)
    .nullable()
    .optional()
    .transform((v) => v ?? 1990),
})

const completeIncomeSchema = z.object({
  annual_salary: z.number().min(0).nullable().optional().default(0),
  bonus_estimate: z.number().min(0).nullable().optional().default(0),
  pay_frequency: z
    .enum(["monthly", "bi-monthly", "weekly"])
    .optional()
    .default("monthly"),
})

const completeSavingsGoalSchema = z.object({
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

const cpfBalanceSchema = z.object({
  profileIndex: z.number().int().min(0),
  oa: z.number().min(0).optional().default(0),
  sa: z.number().min(0).optional().default(0),
  ma: z.number().min(0).optional().default(0),
})

const investmentSchema = z.object({
  type: z.enum(["stock", "gold", "silver", "ilp", "etf", "bond"]),
  symbol: z.string(),
  units: z.number().min(0).optional().default(0),
  cost_basis: z.number().min(0).optional().default(0),
  profileIndex: z.number().int().min(0),
})

const loanSchema = z.object({
  name: z.string(),
  type: z.enum(["housing", "personal", "car", "education"]),
  principal: z.number().min(0).optional().default(0),
  rate_pct: z.number().min(0).optional().default(0),
  tenure_months: z.number().int().min(0).optional().default(0),
  start_date: z
    .string()
    .optional()
    .default(() => new Date().toISOString().slice(0, 10)),
  lender: z.string().optional(),
  use_cpf_oa: z.boolean().optional().default(false),
  profileIndex: z.number().int().min(0),
})

const insuranceSchema = z.object({
  name: z.string(),
  type: z.string(),
  premium_amount: z.number().min(0).optional().default(0),
  frequency: z.enum(["monthly", "yearly"]).optional().default("yearly"),
  coverage_amount: z.number().min(0).optional(),
  profileIndex: z.number().int().min(0),
})

const taxReliefSchema = z.object({
  relief_type: z.string(),
  amount: z.number().min(0).optional().default(0),
  profileIndex: z.number().int().min(0),
})

const completeSchema = z.object({
  mode: z
    .enum(["first-time", "new-family", "resume"])
    .optional()
    .default("first-time"),
  userCount: z.number().int().min(1).max(6),
  profiles: z.array(completeProfileSchema).min(1).max(6),
  incomeConfigs: z.array(completeIncomeSchema),
  bankAccounts: z.array(
    bankAccountSchema.omit({ profile_id: true }).extend({
      profile_id: z.string().uuid().nullable().optional(),
      opening_balance: z.number().min(0).optional(),
      savings_goals: z.array(completeSavingsGoalSchema).optional().default([]),
    })
  ),
  cpfBalances: z.array(cpfBalanceSchema).optional().default([]),
  telegramChatId: z.string().optional().default(""),
  promptSchedule: z.array(completePromptScheduleSchema),
  investments: z.array(investmentSchema).optional().default([]),
  loans: z.array(loanSchema).optional().default([]),
  insurancePolicies: z.array(insuranceSchema).optional().default([]),
  taxReliefInputs: z.array(taxReliefSchema).optional().default([]),
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
      const flattened = parsed.error.flatten()
      const details = flattened.fieldErrors as Record<
        string,
        string[] | undefined
      >
      const firstError = Object.entries(details)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
        .join("; ")
      return NextResponse.json(
        {
          error: "Invalid data",
          details,
          message: firstError || parsed.error.message,
        },
        { status: 400 }
      )
    }

    const data = parsed.data
    const supabase = createSupabaseAdmin()
    const isNewFamily = data.mode === "new-family"

    let familyId: string

    if (isNewFamily) {
      const { count: familyCount } = await supabase
        .from("families")
        .select("id", { count: "exact", head: true })
        .eq("household_id", session.accountId)
      const nextNum = (familyCount ?? 0) + 1
      const newFamilyName = `Family ${nextNum}`
      const { data: newFamily, error: familyError } = await supabase
        .from("families")
        .insert({
          household_id: session.accountId,
          name: newFamilyName,
          ...encodeFamilyPiiPatch({ name: newFamilyName }),
          user_count: data.userCount,
        })
        .select("id")
        .single()
      if (familyError || !newFamily) {
        console.error("Onboarding family create error:", familyError)
        return NextResponse.json(
          { error: "Failed to create family" },
          { status: 500 }
        )
      }
      familyId = newFamily.id
    } else {
      const { data: existingFamily } = await supabase
        .from("families")
        .select("id")
        .eq("household_id", session.accountId)
        .order("created_at", { ascending: true })
        .limit(1)
        .single()
      if (existingFamily) {
        familyId = existingFamily.id
        await supabase
          .from("families")
          .update({ user_count: data.userCount })
          .eq("id", familyId)
      } else {
        const { data: newFamily, error: familyError } = await supabase
          .from("families")
          .insert({
            household_id: session.accountId,
            name: "Family 1",
            ...encodeFamilyPiiPatch({ name: "Family 1" }),
            user_count: data.userCount,
          })
          .select("id")
          .single()
        if (familyError || !newFamily) {
          console.error("Onboarding family create error:", familyError)
          return NextResponse.json(
            { error: "Failed to create family" },
            { status: 500 }
          )
        }
        familyId = newFamily.id
      }
    }

    const newChatId = data.telegramChatId || null
    const householdChatPatch = encodeHouseholdPiiPatch({
      telegram_chat_id: newChatId,
    })
    if (!isNewFamily) {
      const { error: householdError } = await supabase
        .from("households")
        .update({
          user_count: data.userCount,
          telegram_chat_id: newChatId,
          ...householdChatPatch,
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq("id", session.accountId)
      if (householdError) {
        console.error("Onboarding household update error:", householdError)
        return NextResponse.json(
          { error: "Failed to update household" },
          { status: 500 }
        )
      }
    } else {
      const { error: householdError } = await supabase
        .from("households")
        .update({
          telegram_chat_id: newChatId,
          ...householdChatPatch,
        })
        .eq("id", session.accountId)
      if (householdError) {
        console.error("Onboarding household update error:", householdError)
      }
    }

    const { data: existingProfiles } = await supabase
      .from("profiles")
      .select("id, name")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true })

    let insertedProfiles: { id: string }[]

    if (
      existingProfiles &&
      existingProfiles.length === data.userCount &&
      !isNewFamily
    ) {
      // Reuse existing profiles to avoid duplicates and ensure CPF/data maps to displayed profiles
      insertedProfiles = existingProfiles.map((p) => ({ id: p.id }))
    } else {
      const existingNames = new Set(
        (existingProfiles ?? []).map((p) => p.name.toLowerCase().trim())
      )
      const resolvedProfiles = data.profiles.map((p) => {
        const baseName = p.name.trim()
        const nameKey = baseName.toLowerCase()
        if (!existingNames.has(nameKey)) {
          existingNames.add(nameKey)
          return { ...p, name: baseName }
        }
        let suffix = 1
        let candidate: string
        do {
          candidate = `${baseName}-${suffix}`
          suffix++
        } while (existingNames.has(candidate.toLowerCase()))
        existingNames.add(candidate.toLowerCase())
        return { ...p, name: candidate }
      })

      const { data: inserted, error: profileError } = await supabase
        .from("profiles")
        .insert(
          resolvedProfiles.map((p) => ({
            family_id: familyId,
            name: p.name,
            birth_year: p.birth_year,
            ...encodeProfilePiiPatch({
              name: p.name,
              birth_year: p.birth_year,
            }),
          }))
        )
        .select("id")

      if (profileError || !inserted) {
        console.error("Onboarding profile insert error:", profileError)
        const isTableNotFound =
          profileError?.code === "PGRST205" ||
          profileError?.message?.includes("schema cache")
        return NextResponse.json(
          {
            error: isTableNotFound
              ? "Profiles table not found. Run the migration: Supabase Dashboard → SQL Editor → paste contents of supabase/migrations/004_ensure_profiles.sql"
              : "Failed to create profiles",
          },
          { status: 500 }
        )
      }
      insertedProfiles = inserted
    }

    // Insert or upsert Income Configs (upsert when reusing profiles)
    const incomeInserts = data.incomeConfigs
      .slice(0, insertedProfiles.length)
      .map((ic, idx) => ({
        profile_id: insertedProfiles[idx].id,
        annual_salary: ic.annual_salary ?? 0,
        bonus_estimate: ic.bonus_estimate ?? 0,
        pay_frequency: ic.pay_frequency,
      }))
    await supabase
      .from("income_config")
      .upsert(incomeInserts, { onConflict: "profile_id" })

    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`

    // Insert CPF Balances
    for (const cb of data.cpfBalances) {
      const profileId = insertedProfiles[cb.profileIndex]?.id
      if (profileId && (cb.oa > 0 || cb.sa > 0 || cb.ma > 0)) {
        await supabase.from("cpf_balances").upsert(
          {
            profile_id: profileId,
            month: currentMonth,
            oa: cb.oa,
            sa: cb.sa,
            ma: cb.ma,
            is_manual_override: true,
          },
          { onConflict: "profile_id,month" }
        )
      }
    }

    // Insert Bank Accounts & Goals (skip duplicates by bank_name + account_type)
    const { data: existingBanks } = await supabase
      .from("bank_accounts")
      .select("bank_name, account_type")
      .eq("family_id", familyId)

    const existingBankKeys = new Set(
      (existingBanks ?? []).map(
        (b) => `${b.bank_name}|${b.account_type}`
      )
    )

    for (const acc of data.bankAccounts) {
      const key = `${acc.bank_name}|${acc.account_type}`
      if (existingBankKeys.has(key)) continue

      const { data: insertedAcc } = await supabase
        .from("bank_accounts")
        .insert({
          family_id: familyId,
          bank_name: acc.bank_name,
          account_type: acc.account_type,
          profile_id: acc.profile_id ?? null,
          opening_balance: acc.opening_balance ?? 0,
        })
        .select("id")
        .single()

      if (insertedAcc && acc.savings_goals.length > 0) {
        const validGoals = acc.savings_goals.filter(
          (g) => (g.name?.trim() ?? "").length > 0 && (g.target_amount ?? 0) > 0
        )
        if (validGoals.length > 0) {
          await supabase.from("savings_goals").insert(
            validGoals.map((g) => ({
              family_id: familyId,
              profile_id: acc.profile_id ?? null,
              name: g.name ?? "",
              target_amount: g.target_amount ?? 0,
              current_amount: g.current_amount ?? 0,
              deadline: g.deadline ?? null,
              category: "custom",
            }))
          )
        }
      }
    }

    // Insert Prompt Schedule (replace existing for this family)
    if (data.promptSchedule.length > 0) {
      await supabase
        .from("prompt_schedule")
        .delete()
        .eq("family_id", familyId)

      await supabase.from("prompt_schedule").insert(
        data.promptSchedule.map((s) => ({
          family_id: familyId,
          prompt_type: s.prompt_type,
          frequency: s.frequency,
          day_of_month: s.day_of_month,
          month_of_year: s.month_of_year,
          time: s.time,
          timezone: s.timezone,
        }))
      )
    }

    // Insert Investments (skip duplicates by symbol + type + profile_id)
    const { data: existingInvestments } = await supabase
      .from("investments")
      .select("symbol, type, profile_id")
      .eq("family_id", familyId)

    const existingInvKeys = new Set(
      (existingInvestments ?? []).map(
        (i) => `${i.symbol}|${i.type}|${i.profile_id}`
      )
    )

    for (const inv of data.investments) {
      const profileId = insertedProfiles[inv.profileIndex]?.id
      if (profileId && inv.symbol.trim() && inv.units > 0) {
        const key = `${inv.symbol.trim()}|${inv.type}|${profileId}`
        if (existingInvKeys.has(key)) continue

        await supabase.from("investments").insert({
          family_id: familyId,
          profile_id: profileId,
          type: inv.type,
          symbol: inv.symbol.trim(),
          units: inv.units,
          cost_basis: inv.cost_basis,
        })
      }
    }

    // Insert Loans
    for (const loan of data.loans) {
      const profileId = insertedProfiles[loan.profileIndex]?.id
      if (
        profileId &&
        loan.name.trim() &&
        loan.principal > 0 &&
        loan.tenure_months > 0
      ) {
        await supabase.from("loans").insert({
          profile_id: profileId,
          name: loan.name.trim(),
          type: loan.type,
          principal: loan.principal,
          rate_pct: loan.rate_pct,
          tenure_months: loan.tenure_months,
          start_date: loan.start_date,
          lender: loan.lender ?? null,
          ...encodeLoanPiiPatch({
            lender: loan.lender ?? null,
            principal: loan.principal,
          }),
          use_cpf_oa: loan.use_cpf_oa,
        })
      }
    }

    // Insert Insurance Policies
    for (const pol of data.insurancePolicies) {
      const profileId = insertedProfiles[pol.profileIndex]?.id
      if (profileId && pol.name.trim() && pol.premium_amount > 0) {
        await supabase.from("insurance_policies").insert({
          profile_id: profileId,
          name: pol.name.trim(),
          type: pol.type,
          premium_amount: pol.premium_amount,
          frequency: pol.frequency,
          coverage_amount: pol.coverage_amount ?? null,
          is_active: true,
          deduct_from_outflow: true,
        })
      }
    }

    // Insert Tax Relief Inputs
    const currentYear = new Date().getFullYear()
    for (const rel of data.taxReliefInputs) {
      const profileId = insertedProfiles[rel.profileIndex]?.id
      if (profileId && rel.amount > 0) {
        await supabase.from("tax_relief_inputs").upsert(
          {
            profile_id: profileId,
            year: currentYear,
            relief_type: rel.relief_type,
            amount: rel.amount,
          },
          { onConflict: "profile_id,year,relief_type" }
        )
      }
    }

    // Reissue JWT with onboarding complete claim
    const newToken = await createSession(session.accountId, {
      onboardingComplete: true,
      isSuperAdmin: session.isSuperAdmin,
    })
    const isProduction = process.env.NODE_ENV === "production"
    const response = NextResponse.json({ success: true })
    response.cookies.set(COOKIE_NAME, newToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    })
    return response
  } catch (error) {
    console.error("Onboarding error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
