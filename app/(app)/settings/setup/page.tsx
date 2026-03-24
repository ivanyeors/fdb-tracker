import { Suspense } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getSessionFromCookies } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { AccountOverview } from "./profile-switcher"
import { TelegramApiKeysSection } from "./telegram-api-keys-section"
import { SetupTabsClient } from "./setup-tabs"
import { SetupSkeleton } from "./setup-skeleton"

export default async function SetupPage() {
  const cookieStore = await cookies()
  const householdId = await getSessionFromCookies(cookieStore)

  if (!householdId) {
    redirect("/login")
  }

  const supabase = createSupabaseAdmin()

  const { data: families } = await supabase
    .from("families")
    .select("id, name, user_count, created_at")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true })

  const familyIds = (families ?? []).map((f) => f.id)
  const { data: profiles } =
    familyIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, name, birth_year, created_at, family_id")
          .in("family_id", familyIds)
          .order("created_at", { ascending: true })
      : { data: [] }

  const { data: household, error: householdError } = await supabase
    .from("households")
    .select("onboarding_completed_at, user_count")
    .eq("id", householdId)
    .single()

  if (householdError || !household) {
    return (
      <div className="p-2 sm:p-4">
        <h1 className="text-2xl font-semibold text-destructive">
          Error Loading Setup Info
        </h1>
        <p className="text-muted-foreground mt-1">
          {householdError?.message || "Could not retrieve setup data."}
        </p>
      </div>
    )
  }

  const firstFamilyId = families?.[0]?.id ?? null

  return (
    <div className="p-2 sm:p-4 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Setup</h1>
        <p className="text-muted-foreground mt-1">
          Review setup configuration, import ILP fund reports, or add new
          families via the onboarding wizard.
        </p>
      </div>

      <Suspense fallback={<SetupSkeleton />}>
        <SetupTabsClient familyId={firstFamilyId}>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Account
          </h3>
          <AccountOverview
            profiles={profiles ?? []}
            families={families ?? []}
            household={household}
          />

          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Integrations
          </h3>
          <TelegramApiKeysSection />
        </SetupTabsClient>
      </Suspense>
    </div>
  )
}
