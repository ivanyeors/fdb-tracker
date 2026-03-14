import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { format } from "date-fns"
import { resetOnboardingAction } from "../actions"
import { getSessionFromCookies } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ProfileSwitcher } from "./profile-switcher"

export default async function SetupPage() {
  const cookieStore = await cookies()
  const householdId = await getSessionFromCookies(cookieStore)

  if (!householdId) {
    redirect("/login")
  }

  const supabase = createSupabaseAdmin()

  const [householdResult, profilesResult] = await Promise.all([
    supabase
      .from("households")
      .select("onboarding_completed_at, user_count")
      .eq("id", householdId)
      .single(),
    supabase
      .from("profiles")
      .select("id, name, birth_year, created_at")
      .eq("household_id", householdId)
      .order("created_at", { ascending: true }),
  ])

  const { data: household, error: householdError } = householdResult
  const { data: profiles, error: profilesError } = profilesResult

  if (householdError || !household) {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="text-2xl font-semibold text-destructive">Error Loading Setup Info</h1>
        <p className="text-muted-foreground mt-1">
          {householdError?.message || "Could not retrieve setup data."}
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Setup</h1>
        <p className="text-muted-foreground mt-1">
          Review initial setup configuration or run the setup wizard again.
        </p>
      </div>

      <ProfileSwitcher profiles={profiles ?? []} />

      <Card>
        <CardHeader>
          <CardTitle>Onboarding Status</CardTitle>
          <CardDescription>
            Your current account setup details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <span className="font-semibold">Profiles configured:</span> {household.user_count}
          </div>
          <div>
            <span className="font-semibold">Setup Completed:</span>{" "}
            {household.onboarding_completed_at
              ? format(new Date(household.onboarding_completed_at), "MMM d, yyyy h:mm a")
              : "Incomplete"}
          </div>
        </CardContent>
        <CardFooter className="border-t bg-muted/50 px-6 py-4">
          <div className="text-sm text-muted-foreground mb-4">
            Need to start fresh? Re-running the onboarding will let you quickly create new profiles and configuration data. (Note: Existing data won't be deleted automatically here).
          </div>
          <form action={resetOnboardingAction}>
            <Button type="submit" variant="outline">
              Re-run Onboarding
            </Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  )
}
