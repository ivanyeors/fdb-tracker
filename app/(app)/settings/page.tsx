import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getSessionDetails } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { decryptBotToken } from "@/lib/telegram/credentials"
import { ChartPaletteSelector } from "./chart-palette-selector"
import { ThemeSelector } from "./theme-selector"
import { TelegramApiKeysSection } from "./telegram-api-keys-section"
import { TelegramBotConfigSection } from "./telegram-bot-config-section"

export default async function GeneralSettingsPage() {
  const cookieStore = await cookies()
  const session = await getSessionDetails(cookieStore)

  if (!session) {
    redirect("/login")
  }

  const supabase = createSupabaseAdmin()
  const { data: household } = await supabase
    .from("households")
    .select("telegram_bot_token, telegram_bot_token_enc, telegram_chat_id")
    .eq("id", session.accountId)
    .single()

  const botToken = household ? decryptBotToken(household) : null

  return (
    <div className="mx-auto max-w-[1600px] space-y-8 p-2 sm:p-4">
      <div>
        <h1 className="text-2xl font-semibold">General Settings</h1>
        <p className="text-muted-foreground mt-1">
          Theme, chart colors, and integrations.
        </p>
      </div>

      <ThemeSelector />
      <ChartPaletteSelector />

      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Integrations
      </h3>
      <TelegramBotConfigSection
        data={{
          telegram_bot_token: botToken,
          telegram_chat_id: household?.telegram_chat_id ?? null,
        }}
      />
      {session.isSuperAdmin && <TelegramApiKeysSection />}
    </div>
  )
}
