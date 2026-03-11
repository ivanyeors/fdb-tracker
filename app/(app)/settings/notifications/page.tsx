import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getSessionFromCookies } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { NotificationSettingsForm } from "./notification-settings-form"

export default async function NotificationsPage() {
  const cookieStore = await cookies()
  const householdId = await getSessionFromCookies(cookieStore)

  if (!householdId) {
    redirect("/login")
  }

  const supabase = createSupabaseAdmin()
  const { data: household, error } = await supabase
    .from("households")
    .select("telegram_bot_token, telegram_chat_id")
    .eq("id", householdId)
    .single()

  if (error || !household) {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="text-2xl font-semibold text-destructive">Error Loading Settings</h1>
        <p className="text-muted-foreground mt-1">
          {error?.message || "Could not retrieve household settings."}
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="text-muted-foreground mt-1">
          Telegram setup and reminder schedule.
        </p>
      </div>

      <NotificationSettingsForm data={household} />
    </div>
  )
}
