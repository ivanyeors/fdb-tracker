import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getSessionFromCookies } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { FamilyMembersTable, UserSettingsActiveContext } from "./user-settings-form"
import { Button } from "@/components/ui/button"
import type { ProfileWithIncome } from "./types"
import type { FinancialDataByFamily } from "./user-settings-form"

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
          .select("*")
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

  return {
    bankAccounts: bankAccountsRes.data ?? [],
    savingsGoals: savingsGoalsRes.data ?? [],
    investments: investmentsRes.data ?? [],
    loans: loansRes.data ?? [],
    insurancePolicies: insuranceRes.data ?? [],
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
            dps_include_in_projection,
            family_id,
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
    <div className="p-2 sm:p-4 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">User Settings</h1>
        <p className="text-muted-foreground mt-1">
          Per-user financial configuration across all families.
        </p>
        <UserSettingsActiveContext />
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" asChild>
          <Link href="/onboarding?mode=resume">Complete your setup</Link>
        </Button>
      </div>

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

      {familyIds.length === 0 && (
        <p className="text-muted-foreground">
          No families yet. Complete onboarding to create your first family and profiles.
        </p>
      )}
    </div>
  )
}
