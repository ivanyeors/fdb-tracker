import { Suspense } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getSessionFromCookies } from "@/lib/auth/session"
import { decryptString } from "@/lib/crypto/cipher"
import { decodeBankAccountPii } from "@/lib/repos/bank-accounts"
import { decodeCpfBalancesPii } from "@/lib/repos/cpf-balances"
import { decodeFamilyName } from "@/lib/repos/families"
import { decodeIncomeConfigPii } from "@/lib/repos/income-config"
import { decodeInsurancePoliciesPii } from "@/lib/repos/insurance-policies"
import { decodeLoanPii } from "@/lib/repos/loans"
import { decodeMonthlyCashflowPii } from "@/lib/repos/monthly-cashflow"
import { decodeProfilePii } from "@/lib/repos/profiles"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import {
  FamilyMembersTable,
  UserSettingsActiveContext,
} from "./user-settings-form"
import { InviteCodesSection } from "./invite-codes-section"
import { AccountOverview } from "./profile-switcher"
import { Button } from "@/components/ui/button"
import type { ProfileWithIncome } from "./types"
import type { FinancialDataByFamily } from "./user-settings-form"
import { enrichInvestmentsWithLivePrices } from "@/lib/investments/enrich-with-live-prices"

async function fetchFinancialDataForFamily(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  familyId: string,
  profileIds: string[]
) {
  const [
    bankAccountsRes,
    savingsGoalsRes,
    investmentsRes,
    loansRes,
    insuranceRes,
    cpfRes,
    cashflowRes,
  ] = await Promise.all([
    supabase
      .from("bank_accounts")
      .select("*")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true }),
    supabase
      .from("savings_goals")
      .select("*")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true }),
    supabase
      .from("investments")
      .select("*")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true }),
    profileIds.length > 0
      ? supabase
          .from("loans")
          .select("*")
          .in("profile_id", profileIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    profileIds.length > 0
      ? supabase
          .from("insurance_policies")
          .select(
            "*, insurance_policy_coverages(id, coverage_type, coverage_amount, benefit_name, benefit_premium, renewal_bonus, benefit_expiry_date, benefit_unit, sort_order)"
          )
          .in("profile_id", profileIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    profileIds.length > 0
      ? supabase
          .from("cpf_balances")
          .select("*")
          .in("profile_id", profileIds)
          .order("month", { ascending: false })
      : Promise.resolve({ data: [] }),
    profileIds.length > 0
      ? supabase
          .from("monthly_cashflow")
          .select("*")
          .in("profile_id", profileIds)
          .order("month", { ascending: false })
      : Promise.resolve({ data: [] }),
  ])

  const rawInvestments = investmentsRes.data ?? []
  const investmentsEnriched =
    rawInvestments.length === 0
      ? []
      : await enrichInvestmentsWithLivePrices(rawInvestments)

  const investments: FinancialDataByFamily["investments"] =
    investmentsEnriched.map((r) => ({
      id: r.id,
      symbol: r.symbol,
      type: r.type,
      units: r.units,
      cost_basis: r.cost_basis,
      target_allocation_pct:
        ((r as Record<string, unknown>).target_allocation_pct as
          | number
          | null) ?? null,
      profile_id: r.profile_id,
      current_price: r.currentPrice,
      market_value: r.marketValue,
      unrealised_pnl: r.unrealisedPnL,
      unrealised_pnl_pct: r.unrealisedPnLPct,
    }))

  return {
    bankAccounts: (bankAccountsRes.data ?? []).map((a) => ({
      ...a,
      ...decodeBankAccountPii(a),
    })),
    savingsGoals: savingsGoalsRes.data ?? [],
    investments,
    loans: (loansRes.data ?? []).map((l) => {
      const decoded = decodeLoanPii(l)
      return {
        ...l,
        lender: decoded.lender,
        principal: decoded.principal ?? 0,
      }
    }),
    insurancePolicies: (insuranceRes.data ?? []).map((p) => {
      const { insurance_policy_coverages, ...rest } = p as typeof p & {
        insurance_policy_coverages?: Array<{
          id: string
          coverage_type: string | null
          coverage_amount: number
          benefit_name: string | null
          benefit_premium: number | null
          renewal_bonus: number | null
          benefit_expiry_date: string | null
          benefit_unit: string | null
          sort_order: number
        }>
      }
      const decoded = decodeInsurancePoliciesPii(p)
      return {
        ...rest,
        premium_amount: decoded.premium_amount ?? 0,
        coverage_amount: decoded.coverage_amount,
        coverages: insurance_policy_coverages ?? [],
      }
    }),
    cpfBalances: (cpfRes.data ?? []).map((cb) => {
      const decoded = decodeCpfBalancesPii(cb)
      return {
        ...cb,
        oa: decoded.oa ?? 0,
        sa: decoded.sa ?? 0,
        ma: decoded.ma ?? 0,
      }
    }),
    monthlyCashflow: (cashflowRes.data ?? []).map((mc) => {
      const decoded = decodeMonthlyCashflowPii(mc)
      return {
        ...mc,
        inflow: decoded.inflow ?? 0,
        outflow: decoded.outflow ?? 0,
      }
    }),
  } satisfies FinancialDataByFamily
}

function decryptLinkToken(profile: Record<string, unknown>): string | null {
  const enc = profile.telegram_link_token_enc as string | null | undefined
  if (enc) {
    try {
      return decryptString(enc, {
        table: "profiles",
        column: "telegram_link_token_enc",
      })
    } catch (err) {
      console.error(
        "[settings/users] link_token decrypt failed, falling back to plaintext:",
        err,
      )
    }
  }
  return (profile.telegram_link_token as string | null | undefined) ?? null
}

function normalizeProfile(profile: Record<string, unknown>): ProfileWithIncome {
  const incomeConfig = profile.income_config
  const income = Array.isArray(incomeConfig) ? incomeConfig[0] : incomeConfig
  const decoded = decodeProfilePii(profile as Parameters<typeof decodeProfilePii>[0])
  return {
    id: profile.id as string,
    name: decoded.name ?? "",
    birth_year: decoded.birth_year ?? 0,
    dps_include_in_projection:
      (profile.dps_include_in_projection as boolean | undefined) !== false,
    self_help_group: (profile.self_help_group as string | undefined) ?? "none",
    telegram_user_id: decoded.telegram_user_id,
    telegram_chat_id: decoded.telegram_chat_id,
    telegram_link_token: decryptLinkToken(profile),
    telegram_last_used: (profile.telegram_last_used as string | null) ?? null,
    marital_status: (profile.marital_status as string | null) ?? null,
    num_dependents: (profile.num_dependents as number | undefined) ?? 0,
    gender: (profile.gender as string | null) ?? null,
    spouse_profile_id: (profile.spouse_profile_id as string | null) ?? null,
    primary_bank_account_id:
      (profile.primary_bank_account_id as string | null) ?? null,
    income_config: (income as ProfileWithIncome["income_config"]) ?? null,
  }
}

export default async function UserSettingsPage() {
  const cookieStore = await cookies()
  const householdId = await getSessionFromCookies(cookieStore)

  if (!householdId) {
    redirect("/login")
  }

  const supabase = createSupabaseAdmin()

  const { data: household } = await supabase
    .from("households")
    .select("onboarding_completed_at, user_count")
    .eq("id", householdId)
    .single()

  const onboardingComplete = !!household?.onboarding_completed_at

  const { data: rawFamilies } = await supabase
    .from("families")
    .select("id, name, name_enc, user_count, created_at")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true })

  const families = (rawFamilies ?? []).map((f) => ({
    ...f,
    name: decodeFamilyName(f) ?? f.name,
  }))

  const familyIds = (families ?? []).map((f) => f.id)

  const { data: rawProfiles, error } =
    familyIds.length > 0
      ? await supabase
          .from("profiles")
          .select(
            `
            id,
            name,
            name_enc,
            birth_year,
            birth_year_enc,
            created_at,
            marital_status,
            num_dependents,
            gender,
            spouse_profile_id,
            dps_include_in_projection,
            self_help_group,
            family_id,
            telegram_user_id,
            telegram_user_id_enc,
            telegram_chat_id,
            telegram_chat_id_enc,
            telegram_username,
            telegram_username_enc,
            telegram_link_token,
            telegram_link_token_enc,
            telegram_last_used,
            primary_bank_account_id,
            income_config (
              annual_salary_enc,
              bonus_estimate_enc,
              pay_frequency,
              employee_cpf_rate
            )
          `
          )
          .in("family_id", familyIds)
          .order("created_at", { ascending: true })
      : { data: [], error: null }

  const allProfiles = (rawProfiles ?? []).map((p) => {
    const ic = p.income_config as
      | {
          annual_salary_enc: string | null
          bonus_estimate_enc: string | null
          pay_frequency: string
          employee_cpf_rate: number | null
        }
      | null
    if (!ic) return { ...p, income_config: null }
    const decoded = decodeIncomeConfigPii(ic)
    return {
      ...p,
      income_config: {
        annual_salary: decoded.annual_salary ?? 0,
        bonus_estimate: decoded.bonus_estimate ?? 0,
        pay_frequency: ic.pay_frequency,
        employee_cpf_rate: ic.employee_cpf_rate,
      },
    }
  })

  if (error) {
    return (
      <div className="p-2 sm:p-4">
        <h1 className="text-2xl font-semibold text-destructive">
          Error Loading Profiles
        </h1>
        <p className="mt-1 text-muted-foreground">
          {error.message || "Could not retrieve user profiles."}
        </p>
      </div>
    )
  }

  const profilesByFamily = new Map<string, typeof allProfiles>()
  for (const fam of families ?? []) {
    const famProfiles = (allProfiles ?? []).filter(
      (p) => p.family_id === fam.id
    )
    profilesByFamily.set(fam.id, famProfiles)
  }

  const financialDataByFamily = new Map<
    string,
    Awaited<ReturnType<typeof fetchFinancialDataForFamily>>
  >()
  for (const fam of families ?? []) {
    const famProfiles = profilesByFamily.get(fam.id) ?? []
    const profileIds = famProfiles.map((p) => p.id)
    financialDataByFamily.set(
      fam.id,
      await fetchFinancialDataForFamily(supabase, fam.id, profileIds)
    )
  }

  // Fetch notification preferences for all profiles
  const allProfileIds = (allProfiles ?? []).map((p) => p.id)
  const { data: allNotifPrefs } =
    allProfileIds.length > 0
      ? await supabase
          .from("notification_preferences")
          .select(
            "profile_id, notification_type, enabled, day_of_month, month_of_year, time, timezone"
          )
          .in("profile_id", allProfileIds)
      : { data: [] }

  const notificationPrefsByProfile: Record<
    string,
    Array<{
      notification_type: string
      enabled: boolean
      day_of_month: number | null
      month_of_year: number | null
      time: string | null
      timezone: string | null
    }>
  > = {}
  for (const pref of allNotifPrefs ?? []) {
    const pid = pref.profile_id
    if (!notificationPrefsByProfile[pid]) {
      notificationPrefsByProfile[pid] = []
    }
    notificationPrefsByProfile[pid].push({
      notification_type: pref.notification_type,
      enabled: pref.enabled,
      day_of_month: pref.day_of_month,
      month_of_year: pref.month_of_year,
      time: pref.time,
      timezone: pref.timezone,
    })
  }

  // Fetch family-level default schedules (from prompt_schedule)
  const { data: allSchedules } =
    familyIds.length > 0
      ? await supabase
          .from("prompt_schedule")
          .select(
            "family_id, prompt_type, frequency, day_of_month, month_of_year, time, timezone"
          )
          .in("family_id", familyIds)
      : { data: [] }

  const defaultSchedulesByFamily: Record<
    string,
    Array<{
      prompt_type: string
      frequency: string
      day_of_month: number
      month_of_year: number | null
      time: string
      timezone: string
    }>
  > = {}
  for (const sched of allSchedules ?? []) {
    if (!defaultSchedulesByFamily[sched.family_id]) {
      defaultSchedulesByFamily[sched.family_id] = []
    }
    defaultSchedulesByFamily[sched.family_id].push({
      prompt_type: sched.prompt_type,
      frequency: sched.frequency,
      day_of_month: sched.day_of_month,
      month_of_year: sched.month_of_year,
      time: sched.time,
      timezone: sched.timezone,
    })
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-8 p-2 sm:p-4">
      <div>
        <h1 className="text-2xl font-semibold">User Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Manage family members and their financial data.
        </p>
        <UserSettingsActiveContext />
      </div>

      <AccountOverview
        householdId={householdId}
        profiles={(allProfiles ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          birth_year: p.birth_year,
          created_at: p.created_at,
          family_id: (p as Record<string, unknown>).family_id as string,
        }))}
        families={(families ?? []).map((f) => ({
          id: f.id,
          name: f.name,
          user_count: f.user_count,
          created_at: f.created_at,
        }))}
        household={household!}
      />

      {!onboardingComplete && (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4">
          <div className="flex-1">
            <p className="text-sm font-medium">Setup incomplete</p>
            <p className="text-xs text-muted-foreground">
              Complete onboarding to configure all your financial data.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/onboarding?mode=resume">Continue setup</Link>
          </Button>
        </div>
      )}

      <Suspense
        fallback={
          <div className="text-sm text-muted-foreground">
            Loading user settings…
          </div>
        }
      >
        <div className="space-y-8">
          {(families ?? []).map((family) => {
            const rawProfiles = profilesByFamily.get(family.id) ?? []
            const profiles = rawProfiles.map((p) =>
              normalizeProfile(p as Record<string, unknown>)
            )
            const financialData = financialDataByFamily.get(family.id) ?? {
              bankAccounts: [],
              savingsGoals: [],
              investments: [],
              loans: [],
              insurancePolicies: [],
              cpfBalances: [],
              monthlyCashflow: [],
            }
            return (
              <FamilyMembersTable
                key={family.id}
                family={{ id: family.id, name: family.name }}
                profiles={profiles}
                financialData={financialData}
                familyCount={(families ?? []).length}
                notificationPreferencesByProfile={notificationPrefsByProfile}
                defaultSchedules={defaultSchedulesByFamily[family.id] ?? []}
              />
            )
          })}
        </div>
      </Suspense>

      {familyIds.length === 0 && (
        <p className="text-muted-foreground">
          No families yet. Complete onboarding to create your first family and
          profiles.
        </p>
      )}

      <InviteCodesSection
        unlinkedProfiles={(allProfiles ?? [])
          .filter((p) => !p.telegram_user_id)
          .map((p) => ({ id: p.id, name: p.name }))}
      />
    </div>
  )
}
