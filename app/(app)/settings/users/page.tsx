import { Suspense } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getSessionFromCookies } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { FamilyMembersTable, UserSettingsActiveContext } from "./user-settings-form"
import { Button } from "@/components/ui/button"
import type { ProfileWithIncome } from "./types"
import type { FinancialDataByFamily } from "./user-settings-form"
import { enrichInvestmentsWithLivePrices } from "@/lib/investments/enrich-with-live-prices"

function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
}

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
          .select("*, insurance_policy_coverages(id, coverage_type, coverage_amount)")
          .in("profile_id", profileIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    profileIds.length > 0
      ? (() => {
          const currentMonth = getCurrentMonth()
          return supabase
            .from("cpf_balances")
            .select("*")
            .in("profile_id", profileIds)
            .eq("month", currentMonth)
        })()
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
      target_allocation_pct: (r as Record<string, unknown>).target_allocation_pct as number | null ?? null,
      profile_id: r.profile_id,
      current_price: r.currentPrice,
      market_value: r.marketValue,
      unrealised_pnl: r.unrealisedPnL,
      unrealised_pnl_pct: r.unrealisedPnLPct,
    }))

  return {
    bankAccounts: bankAccountsRes.data ?? [],
    savingsGoals: savingsGoalsRes.data ?? [],
    investments,
    loans: loansRes.data ?? [],
    insurancePolicies: (insuranceRes.data ?? []).map((p) => {
      const { insurance_policy_coverages, ...rest } = p as typeof p & {
        insurance_policy_coverages?: Array<{ id: string; coverage_type: string; coverage_amount: number }>
      }
      return {
        ...rest,
        coverages: insurance_policy_coverages ?? [],
      }
    }),
    cpfBalances: cpfRes.data ?? [],
    monthlyCashflow: cashflowRes.data ?? [],
  } satisfies FinancialDataByFamily
}

function normalizeProfile(profile: Record<string, unknown>): ProfileWithIncome {
  const incomeConfig = profile.income_config
  const income = Array.isArray(incomeConfig) ? incomeConfig[0] : incomeConfig
  return {
    id: profile.id as string,
    name: profile.name as string,
    birth_year: profile.birth_year as number,
    dps_include_in_projection:
      (profile.dps_include_in_projection as boolean | undefined) !== false,
    telegram_user_id: (profile.telegram_user_id as string | null) ?? null,
    telegram_chat_id: (profile.telegram_chat_id as string | null) ?? null,
    telegram_link_token: (profile.telegram_link_token as string | null) ?? null,
    telegram_last_used: (profile.telegram_last_used as string | null) ?? null,
    marital_status: (profile.marital_status as string | null) ?? null,
    num_dependents: (profile.num_dependents as number | undefined) ?? 0,
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
    .select("onboarding_completed_at")
    .eq("id", householdId)
    .single()

  const onboardingComplete = !!household?.onboarding_completed_at

  const { data: families } = await supabase
    .from("families")
    .select("id, name, created_at")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true })

  const familyIds = (families ?? []).map((f) => f.id)

  const { data: allProfiles, error } =
    familyIds.length > 0
      ? await supabase
          .from("profiles")
          .select(`
            id,
            name,
            birth_year,
            marital_status,
            num_dependents,
            dps_include_in_projection,
            family_id,
            telegram_user_id,
            telegram_chat_id,
            telegram_link_token,
            telegram_last_used,
            income_config (
              annual_salary,
              bonus_estimate,
              pay_frequency,
              employee_cpf_rate
            )
          `)
          .in("family_id", familyIds)
          .order("created_at", { ascending: true })
      : { data: [], error: null }

  if (error) {
    return (
      <div className="p-2 sm:p-4">
        <h1 className="text-2xl font-semibold text-destructive">Error Loading Profiles</h1>
        <p className="text-muted-foreground mt-1">
          {error.message || "Could not retrieve user profiles."}
        </p>
      </div>
    )
  }

  const profilesByFamily = new Map<string, typeof allProfiles>()
  for (const fam of families ?? []) {
    const famProfiles = (allProfiles ?? []).filter((p) => p.family_id === fam.id)
    profilesByFamily.set(fam.id, famProfiles)
  }

  const financialDataByFamily = new Map<string, Awaited<ReturnType<typeof fetchFinancialDataForFamily>>>()
  for (const fam of families ?? []) {
    const famProfiles = profilesByFamily.get(fam.id) ?? []
    const profileIds = famProfiles.map((p) => p.id as string)
    financialDataByFamily.set(
      fam.id,
      await fetchFinancialDataForFamily(supabase, fam.id, profileIds)
    )
  }

  return (
    <div className="p-2 sm:p-4 max-w-[1600px] mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">User Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage family members and their financial data.
        </p>
        <UserSettingsActiveContext />
      </div>

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
          <div className="text-sm text-muted-foreground">Loading user settings…</div>
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
              />
            )
          })}
        </div>
      </Suspense>

      {familyIds.length === 0 && (
        <p className="text-muted-foreground">
          No families yet. Complete onboarding to create your first family and profiles.
        </p>
      )}
    </div>
  )
}
