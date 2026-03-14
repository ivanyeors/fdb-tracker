import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getSessionFromCookies } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { UserSettingsForm } from "./user-settings-form"
import type { ProfileWithIncome } from "./types"

function normalizeProfile(profile: Record<string, unknown>): ProfileWithIncome {
  const incomeConfig = profile.income_config
  const income = Array.isArray(incomeConfig) ? incomeConfig[0] : incomeConfig
  return {
    id: profile.id as string,
    name: profile.name as string,
    birth_year: profile.birth_year as number,
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
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select(`
      id,
      name,
      birth_year,
      income_config (
        annual_salary,
        bonus_estimate,
        pay_frequency,
        employee_cpf_rate
      )
    `)
    .eq("household_id", householdId)
    .order("created_at", { ascending: true })

  if (error || !profiles) {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="text-2xl font-semibold text-destructive">Error Loading Profiles</h1>
        <p className="text-muted-foreground mt-1">
          {error?.message || "Could not retrieve user profiles."}
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">User Settings</h1>
        <p className="text-muted-foreground mt-1">
          Per-user financial configuration.
        </p>
      </div>

      <div className="grid gap-6">
        {profiles.map((profile) => (
          <UserSettingsForm
            key={profile.id}
            profile={normalizeProfile(profile as Record<string, unknown>)}
          />
        ))}
      </div>
    </div>
  )
}
