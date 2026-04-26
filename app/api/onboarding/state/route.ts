import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { decodeCpfBalancesPii } from "@/lib/repos/cpf-balances"
import { decodeIncomeConfigPii } from "@/lib/repos/income-config"
import { decodeInsurancePoliciesPii } from "@/lib/repos/insurance-policies"
import { decodeLoanPii } from "@/lib/repos/loans"
import { decodeTaxReliefInputsPii } from "@/lib/repos/tax-relief-inputs"
import { createSupabaseAdmin } from "@/lib/supabase/server"

function getLastCompletedStep(data: {
  hasProfiles: boolean
  hasIncome: boolean
  hasCpf: boolean
  hasBanks: boolean
  hasTelegram: boolean
  hasReminders: boolean
}): string {
  if (!data.hasProfiles) return "/onboarding/users"
  if (!data.hasIncome) return "/onboarding/income"
  if (!data.hasCpf) return "/onboarding/cpf"
  if (!data.hasBanks) return "/onboarding/banks"
  if (!data.hasTelegram) return "/onboarding/telegram"
  if (!data.hasReminders) return "/onboarding/reminders"
  return "/onboarding/investments"
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const modeParam = request.nextUrl.searchParams.get("mode")
    const mode = modeParam === "new-family" ? "new-family" : modeParam === "resume" ? "resume" : "first-time"
    const supabase = createSupabaseAdmin()

    const { data: household } = await supabase
      .from("households")
      .select("user_count, telegram_chat_id, onboarding_completed_at")
      .eq("id", session.accountId)
      .single()

    if (!household) {
      return NextResponse.json({ error: "Household not found" }, { status: 404 })
    }

    const { data: families } = await supabase
      .from("families")
      .select("id, name, user_count, created_at")
      .eq("household_id", session.accountId)
      .order("created_at", { ascending: true })

    const familyIds = (families ?? []).map((f) => f.id)
    const targetFamilyId =
      mode === "new-family"
        ? null
        : familyIds[0] ?? null

    if (!targetFamilyId) {
      return NextResponse.json({
        mode,
        userCount: household.user_count ?? 1,
        profiles: [{ name: "", birth_year: null }],
        incomeConfigs: [{ annual_salary: null, bonus_estimate: null, pay_frequency: "monthly" }],
        bankAccounts: [],
        cpfBalances: [],
        telegramChatId: household.telegram_chat_id ?? "",
        promptSchedule: [],
        investments: [],
        loans: [],
        insurancePolicies: [],
        taxReliefInputs: [],
        familyId: null,
        lastCompletedStep: "/onboarding/users",
      })
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, birth_year, family_id")
      .eq("family_id", targetFamilyId)
      .order("created_at", { ascending: true })

    const profileIds = (profiles ?? []).map((p) => p.id)

    const { data: incomeConfigs } =
      profileIds.length > 0
        ? await supabase
            .from("income_config")
            .select(
              "profile_id, annual_salary, annual_salary_enc, bonus_estimate, bonus_estimate_enc, pay_frequency",
            )
            .in("profile_id", profileIds)
        : { data: [] }

    const incomeByProfile = new Map(
      (incomeConfigs ?? []).map((ic) => {
        const decoded = decodeIncomeConfigPii(ic)
        return [
          ic.profile_id,
          {
            ...ic,
            annual_salary: decoded.annual_salary,
            bonus_estimate: decoded.bonus_estimate,
          },
        ]
      }),
    )

    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`
    const { data: cpfRows } = await supabase
      .from("cpf_balances")
      .select("profile_id, oa, oa_enc, sa, sa_enc, ma, ma_enc")
      .in("profile_id", profileIds)
      .eq("month", currentMonth)

    const cpfByProfile = new Map(
      (cpfRows ?? []).map((r) => {
        const decoded = decodeCpfBalancesPii(r)
        return [r.profile_id, { ...r, ...decoded }]
      }),
    )

    const { data: bankAccounts } = await supabase
      .from("bank_accounts")
      .select("id, bank_name, account_type, opening_balance, profile_id")
      .eq("family_id", targetFamilyId)
      .order("created_at", { ascending: true })

    const { data: promptSchedule } = await supabase
      .from("prompt_schedule")
      .select("prompt_type, frequency, day_of_month, month_of_year, time, timezone")
      .eq("family_id", targetFamilyId)
      .order("prompt_type", { ascending: true })

    const { data: investments } = await supabase
      .from("investments")
      .select("id, type, symbol, units, cost_basis, profile_id")
      .eq("family_id", targetFamilyId)
      .order("created_at", { ascending: true })

    const { data: loans } = await supabase
      .from("loans")
      .select("id, name, type, principal, principal_enc, rate_pct, tenure_months, start_date, lender, lender_enc, use_cpf_oa, profile_id")
      .in("profile_id", profileIds)
      .order("created_at", { ascending: true })

    const { data: insurancePolicies } = await supabase
      .from("insurance_policies")
      .select(
        "id, name, type, premium_amount, premium_amount_enc, frequency, coverage_amount, coverage_amount_enc, profile_id",
      )
      .in("profile_id", profileIds)
      .order("created_at", { ascending: true })

    const currentYear = new Date().getFullYear()
    const { data: taxReliefInputs } = await supabase
      .from("tax_relief_inputs")
      .select("profile_id, relief_type, amount, amount_enc")
      .in("profile_id", profileIds)
      .eq("year", currentYear)

    const profileIndexMap = new Map(profileIds.map((id, i) => [id, i]))

    const mappedProfiles = (profiles ?? []).map((p) => ({
      name: p.name,
      birth_year: p.birth_year as number | null,
    }))

    const mappedIncomeConfigs = profileIds.map((pid) => {
      const ic = incomeByProfile.get(pid)
      return {
        annual_salary: ic?.annual_salary ?? null,
        bonus_estimate: ic?.bonus_estimate ?? null,
        pay_frequency: (ic?.pay_frequency ?? "monthly") as "monthly" | "bi-monthly" | "weekly",
      }
    })

    const mappedCpfBalances = (profiles ?? []).map((p, i) => {
      const cb = cpfByProfile.get(p.id)
      return {
        profileIndex: i,
        oa: cb?.oa ?? 0,
        sa: cb?.sa ?? 0,
        ma: cb?.ma ?? 0,
      }
    })

    const mappedBankAccounts = (bankAccounts ?? []).map((acc) => ({
      bank_name: acc.bank_name,
      account_type: acc.account_type as "ocbc_360" | "basic" | "savings" | "fixed_deposit" | "srs",
      opening_balance: acc.opening_balance ?? 0,
      savings_goals: [] as { name: string; target_amount: number | null; current_amount: number; deadline: string | null }[],
    }))

    const mappedPromptSchedule = (promptSchedule ?? []).map((s) => ({
      prompt_type: s.prompt_type as "end_of_month" | "income" | "insurance" | "tax",
      frequency: s.frequency as "monthly" | "yearly",
      day_of_month: s.day_of_month,
      month_of_year: s.month_of_year,
      time: s.time,
      timezone: s.timezone,
    }))

    const mappedInvestments = (investments ?? []).map((inv) => {
      const idx = inv.profile_id ? profileIndexMap.get(inv.profile_id) ?? 0 : 0
      return {
        type: inv.type as "stock" | "gold" | "silver" | "ilp" | "etf" | "bond",
        symbol: inv.symbol,
        units: inv.units ?? 0,
        cost_basis: inv.cost_basis ?? 0,
        profileIndex: idx,
      }
    })

    const mappedLoans = (loans ?? []).map((l) => {
      const idx = l.profile_id ? profileIndexMap.get(l.profile_id) ?? 0 : 0
      const decoded = decodeLoanPii(l)
      return {
        name: l.name,
        type: l.type as "housing" | "personal" | "car" | "education",
        principal: decoded.principal ?? 0,
        rate_pct: l.rate_pct ?? 0,
        tenure_months: l.tenure_months ?? 0,
        start_date: l.start_date ?? new Date().toISOString().slice(0, 10),
        lender: decoded.lender ?? undefined,
        use_cpf_oa: l.use_cpf_oa ?? false,
        profileIndex: idx,
      }
    })

    const mappedInsurance = (insurancePolicies ?? []).map((p) => {
      const idx = p.profile_id ? profileIndexMap.get(p.profile_id) ?? 0 : 0
      const decoded = decodeInsurancePoliciesPii(p)
      return {
        name: p.name,
        type: p.type,
        premium_amount: decoded.premium_amount ?? 0,
        frequency: (p.frequency ?? "yearly") as "monthly" | "yearly",
        coverage_amount: decoded.coverage_amount ?? undefined,
        profileIndex: idx,
      }
    })

    const mappedTaxReliefs = (taxReliefInputs ?? []).map((r) => {
      const idx = r.profile_id ? profileIndexMap.get(r.profile_id) ?? 0 : 0
      return {
        relief_type: r.relief_type,
        amount: decodeTaxReliefInputsPii(r).amount ?? 0,
        profileIndex: idx,
      }
    })

    const hasProfiles = mappedProfiles.length > 0 && mappedProfiles.some((p) => p.name?.trim())
    const hasIncome = mappedIncomeConfigs.some((ic) => (ic.annual_salary ?? 0) > 0)
    const hasCpf = mappedCpfBalances.some((cb) => cb.oa > 0 || cb.sa > 0 || cb.ma > 0)
    const hasBanks = mappedBankAccounts.length > 0
    const hasTelegram = !!(household.telegram_chat_id?.trim())
    const hasReminders = mappedPromptSchedule.length > 0

    const canSkip = hasProfiles && hasIncome && hasBanks

    const lastCompletedStep = getLastCompletedStep({
      hasProfiles,
      hasIncome,
      hasCpf,
      hasBanks,
      hasTelegram,
      hasReminders,
    })

    return NextResponse.json({
      mode,
      userCount: mappedProfiles.length || household.user_count || 1,
      profiles: mappedProfiles.length ? mappedProfiles : [{ name: "", birth_year: null }],
      incomeConfigs: mappedIncomeConfigs.length ? mappedIncomeConfigs : [{ annual_salary: null, bonus_estimate: null, pay_frequency: "monthly" }],
      bankAccounts: mappedBankAccounts,
      cpfBalances: mappedCpfBalances,
      telegramChatId: household.telegram_chat_id ?? "",
      promptSchedule: mappedPromptSchedule.length ? mappedPromptSchedule : [
        { prompt_type: "end_of_month", frequency: "monthly", day_of_month: 28, month_of_year: null, time: "20:00", timezone: "Asia/Singapore" },
        { prompt_type: "income", frequency: "monthly", day_of_month: 1, month_of_year: null, time: "09:00", timezone: "Asia/Singapore" },
        { prompt_type: "insurance", frequency: "yearly", day_of_month: 1, month_of_year: 1, time: "09:00", timezone: "Asia/Singapore" },
        { prompt_type: "tax", frequency: "yearly", day_of_month: 1, month_of_year: 3, time: "09:00", timezone: "Asia/Singapore" },
      ],
      investments: mappedInvestments,
      loans: mappedLoans,
      insurancePolicies: mappedInsurance,
      taxReliefInputs: mappedTaxReliefs,
      familyId: targetFamilyId,
      profileIds,
      lastCompletedStep,
      canSkip,
    })
  } catch (error) {
    console.error("Onboarding state error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
