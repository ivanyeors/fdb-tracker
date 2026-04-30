import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, createSession, COOKIE_NAME } from "@/lib/auth/session"
import { encodeCpfBalancesPiiPatch } from "@/lib/repos/cpf-balances"
import { encodeFamilyPiiPatch } from "@/lib/repos/families"
import { encodeHouseholdPiiPatch } from "@/lib/repos/households"
import { encodeIncomeConfigPiiPatch } from "@/lib/repos/income-config"
import { encodeInsurancePoliciesPiiPatch } from "@/lib/repos/insurance-policies"
import { encodeTaxReliefInputsPiiPatch } from "@/lib/repos/tax-relief-inputs"
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

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>

function formatValidationError(parsed: { error: z.ZodError }): NextResponse {
  const flattened = parsed.error.flatten()
  const details = flattened.fieldErrors as Record<string, string[] | undefined>
  const firstError = Object.entries(details)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("; ")
  return NextResponse.json(
    {
      error: "Invalid data",
      details,
      message: firstError || parsed.error.message,
    },
    { status: 400 },
  )
}

async function createNewFamily(
  supabase: SupabaseAdmin,
  accountId: string,
  userCount: number,
  name: string,
): Promise<{ id: string } | { error: NextResponse }> {
  const { data: newFamily, error } = await supabase
    .from("families")
    .insert({
      household_id: accountId,
      name,
      ...encodeFamilyPiiPatch({ name }),
      user_count: userCount,
    })
    .select("id")
    .single()
  if (error || !newFamily) {
    console.error("Onboarding family create error:", error)
    return {
      error: NextResponse.json(
        { error: "Failed to create family" },
        { status: 500 },
      ),
    }
  }
  return { id: newFamily.id }
}

async function resolveFamilyId(
  supabase: SupabaseAdmin,
  accountId: string,
  isNewFamily: boolean,
  userCount: number,
): Promise<{ familyId: string } | { error: NextResponse }> {
  if (isNewFamily) {
    const { count: familyCount } = await supabase
      .from("families")
      .select("id", { count: "exact", head: true })
      .eq("household_id", accountId)
    const nextNum = (familyCount ?? 0) + 1
    const result = await createNewFamily(
      supabase,
      accountId,
      userCount,
      `Family ${nextNum}`,
    )
    return "error" in result ? result : { familyId: result.id }
  }

  const { data: existingFamily } = await supabase
    .from("families")
    .select("id")
    .eq("household_id", accountId)
    .order("created_at", { ascending: true })
    .limit(1)
    .single()
  if (existingFamily) {
    await supabase
      .from("families")
      .update({ user_count: userCount })
      .eq("id", existingFamily.id)
    return { familyId: existingFamily.id }
  }
  const result = await createNewFamily(supabase, accountId, userCount, "Family 1")
  return "error" in result ? result : { familyId: result.id }
}

async function updateHousehold(
  supabase: SupabaseAdmin,
  accountId: string,
  isNewFamily: boolean,
  userCount: number,
  telegramChatId: string | null,
): Promise<NextResponse | null> {
  const householdChatPatch = encodeHouseholdPiiPatch({
    telegram_chat_id: telegramChatId,
  })
  if (isNewFamily) {
    const { error } = await supabase
      .from("households")
      .update({ telegram_chat_id: telegramChatId, ...householdChatPatch })
      .eq("id", accountId)
    if (error) console.error("Onboarding household update error:", error)
    return null
  }
  const { error } = await supabase
    .from("households")
    .update({
      user_count: userCount,
      telegram_chat_id: telegramChatId,
      ...householdChatPatch,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", accountId)
  if (error) {
    console.error("Onboarding household update error:", error)
    return NextResponse.json(
      { error: "Failed to update household" },
      { status: 500 },
    )
  }
  return null
}

function dedupeProfileNames(
  profiles: Array<{ name: string; birth_year: number }>,
  existingNames: Set<string>,
) {
  return profiles.map((p) => {
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
}

async function resolveProfiles(
  supabase: SupabaseAdmin,
  familyId: string,
  isNewFamily: boolean,
  userCount: number,
  profilesInput: Array<{ name: string; birth_year: number }>,
): Promise<{ ids: { id: string }[] } | { error: NextResponse }> {
  const { data: existingProfiles } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("family_id", familyId)
    .order("created_at", { ascending: true })

  if (existingProfiles?.length === userCount && !isNewFamily) {
    return { ids: existingProfiles.map((p) => ({ id: p.id })) }
  }

  const existingNames = new Set(
    (existingProfiles ?? []).map((p) => p.name.toLowerCase().trim()),
  )
  const resolvedProfiles = dedupeProfileNames(profilesInput, existingNames)

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
      })),
    )
    .select("id")

  if (profileError || !inserted) {
    console.error("Onboarding profile insert error:", profileError)
    const isTableNotFound =
      profileError?.code === "PGRST205" ||
      profileError?.message?.includes("schema cache")
    return {
      error: NextResponse.json(
        {
          error: isTableNotFound
            ? "Profiles table not found. Run the migration: Supabase Dashboard → SQL Editor → paste contents of supabase/migrations/004_ensure_profiles.sql"
            : "Failed to create profiles",
        },
        { status: 500 },
      ),
    }
  }
  return { ids: inserted }
}

async function upsertIncomeConfigs(
  supabase: SupabaseAdmin,
  insertedProfiles: { id: string }[],
  incomeConfigs: Array<{
    annual_salary: number | null
    bonus_estimate: number | null
    pay_frequency: "monthly" | "bi-monthly" | "weekly"
  }>,
): Promise<void> {
  const incomeInserts = incomeConfigs
    .slice(0, insertedProfiles.length)
    .map((ic, idx) => ({
      profile_id: insertedProfiles[idx].id,
      ...encodeIncomeConfigPiiPatch({
        annual_salary: ic.annual_salary ?? 0,
        bonus_estimate: ic.bonus_estimate ?? 0,
      }),
      pay_frequency: ic.pay_frequency,
    }))
  await supabase
    .from("income_config")
    .upsert(incomeInserts, { onConflict: "profile_id" })
}

async function upsertCpfBalances(
  supabase: SupabaseAdmin,
  insertedProfiles: { id: string }[],
  balances: Array<{ profileIndex: number; oa: number; sa: number; ma: number }>,
  currentMonth: string,
): Promise<void> {
  for (const cb of balances) {
    const profileId = insertedProfiles[cb.profileIndex]?.id
    if (!profileId) continue
    if (cb.oa <= 0 && cb.sa <= 0 && cb.ma <= 0) continue
    await supabase.from("cpf_balances").upsert(
      {
        profile_id: profileId,
        month: currentMonth,
        ...encodeCpfBalancesPiiPatch({ oa: cb.oa, sa: cb.sa, ma: cb.ma }),
        is_manual_override: true,
      },
      { onConflict: "profile_id,month" },
    )
  }
}

type BankAccountInput = {
  bank_name: string
  account_type: string
  profile_id?: string | null
  opening_balance?: number
  savings_goals: Array<{
    name: string
    target_amount: number | null
    current_amount: number
    deadline: string | null
  }>
}

async function insertBankAccountsAndGoals(
  supabase: SupabaseAdmin,
  familyId: string,
  bankAccounts: BankAccountInput[],
): Promise<void> {
  const { data: existingBanks } = await supabase
    .from("bank_accounts")
    .select("bank_name, account_type")
    .eq("family_id", familyId)
  const existingBankKeys = new Set(
    (existingBanks ?? []).map((b) => `${b.bank_name}|${b.account_type}`),
  )

  for (const acc of bankAccounts) {
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
    if (!insertedAcc || acc.savings_goals.length === 0) continue
    const validGoals = acc.savings_goals.filter(
      (g) => (g.name?.trim() ?? "").length > 0 && (g.target_amount ?? 0) > 0,
    )
    if (validGoals.length === 0) continue
    await supabase.from("savings_goals").insert(
      validGoals.map((g) => ({
        family_id: familyId,
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

async function replacePromptSchedule(
  supabase: SupabaseAdmin,
  familyId: string,
  schedule: Array<z.infer<typeof completePromptScheduleSchema>>,
): Promise<void> {
  if (schedule.length === 0) return
  await supabase.from("prompt_schedule").delete().eq("family_id", familyId)
  await supabase.from("prompt_schedule").insert(
    schedule.map((s) => ({
      family_id: familyId,
      prompt_type: s.prompt_type,
      frequency: s.frequency,
      day_of_month: s.day_of_month,
      month_of_year: s.month_of_year,
      time: s.time,
      timezone: s.timezone,
    })),
  )
}

async function insertInvestments(
  supabase: SupabaseAdmin,
  familyId: string,
  insertedProfiles: { id: string }[],
  investments: Array<z.infer<typeof investmentSchema>>,
): Promise<void> {
  const { data: existingInvestments } = await supabase
    .from("investments")
    .select("symbol, type, profile_id")
    .eq("family_id", familyId)
  const existingInvKeys = new Set(
    (existingInvestments ?? []).map(
      (i) => `${i.symbol}|${i.type}|${i.profile_id}`,
    ),
  )
  for (const inv of investments) {
    const profileId = insertedProfiles[inv.profileIndex]?.id
    if (!profileId || !inv.symbol.trim() || inv.units <= 0) continue
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

async function insertLoans(
  supabase: SupabaseAdmin,
  insertedProfiles: { id: string }[],
  loans: Array<z.infer<typeof loanSchema>>,
): Promise<void> {
  for (const loan of loans) {
    const profileId = insertedProfiles[loan.profileIndex]?.id
    if (
      !profileId ||
      !loan.name.trim() ||
      loan.principal <= 0 ||
      loan.tenure_months <= 0
    ) {
      continue
    }
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

async function insertInsurancePolicies(
  supabase: SupabaseAdmin,
  insertedProfiles: { id: string }[],
  policies: Array<z.infer<typeof insuranceSchema>>,
): Promise<void> {
  for (const pol of policies) {
    const profileId = insertedProfiles[pol.profileIndex]?.id
    if (!profileId || !pol.name.trim() || pol.premium_amount <= 0) continue
    await supabase.from("insurance_policies").insert({
      profile_id: profileId,
      name: pol.name.trim(),
      type: pol.type,
      frequency: pol.frequency,
      ...encodeInsurancePoliciesPiiPatch({
        premium_amount: pol.premium_amount,
        coverage_amount: pol.coverage_amount ?? null,
      }),
      is_active: true,
      deduct_from_outflow: true,
    })
  }
}

async function upsertTaxReliefInputs(
  supabase: SupabaseAdmin,
  insertedProfiles: { id: string }[],
  reliefs: Array<z.infer<typeof taxReliefSchema>>,
  currentYear: number,
): Promise<void> {
  for (const rel of reliefs) {
    const profileId = insertedProfiles[rel.profileIndex]?.id
    if (!profileId || rel.amount <= 0) continue
    await supabase.from("tax_relief_inputs").upsert(
      {
        profile_id: profileId,
        year: currentYear,
        relief_type: rel.relief_type,
        ...encodeTaxReliefInputsPiiPatch({ amount: rel.amount }),
      },
      { onConflict: "profile_id,year,relief_type" },
    )
  }
}

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
      profile_id: z.uuid().nullable().optional(),
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
    if (!parsed.success) return formatValidationError(parsed)

    const data = parsed.data
    const supabase = createSupabaseAdmin()
    const isNewFamily = data.mode === "new-family"

    const familyResult = await resolveFamilyId(
      supabase,
      session.accountId,
      isNewFamily,
      data.userCount,
    )
    if ("error" in familyResult) return familyResult.error
    const { familyId } = familyResult

    const householdError = await updateHousehold(
      supabase,
      session.accountId,
      isNewFamily,
      data.userCount,
      data.telegramChatId || null,
    )
    if (householdError) return householdError

    const profilesResult = await resolveProfiles(
      supabase,
      familyId,
      isNewFamily,
      data.userCount,
      data.profiles,
    )
    if ("error" in profilesResult) return profilesResult.error
    const insertedProfiles = profilesResult.ids

    await upsertIncomeConfigs(supabase, insertedProfiles, data.incomeConfigs)

    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`
    await upsertCpfBalances(
      supabase,
      insertedProfiles,
      data.cpfBalances,
      currentMonth,
    )

    await insertBankAccountsAndGoals(supabase, familyId, data.bankAccounts)
    await replacePromptSchedule(supabase, familyId, data.promptSchedule)
    await insertInvestments(
      supabase,
      familyId,
      insertedProfiles,
      data.investments,
    )
    await insertLoans(supabase, insertedProfiles, data.loans)
    await insertInsurancePolicies(
      supabase,
      insertedProfiles,
      data.insurancePolicies,
    )
    await upsertTaxReliefInputs(
      supabase,
      insertedProfiles,
      data.taxReliefInputs,
      new Date().getFullYear(),
    )

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
