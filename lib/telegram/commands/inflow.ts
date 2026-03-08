import { format, startOfMonth } from "date-fns"

import { createSupabaseAdmin } from "@/lib/supabase/server"
import { parseInOutArgs } from "@/lib/telegram/command-parser"
import { resolveUser } from "@/lib/telegram/user-resolver"

export async function handleInflow(
  householdId: string,
  text: string,
): Promise<string> {
  const parsed = parseInOutArgs(text)
  if ("error" in parsed) return `❌ ${parsed.error}`

  const user = await resolveUser(parsed.name ?? "", householdId)
  if ("error" in user) return `❌ ${user.error}`

  const supabase = createSupabaseAdmin()
  const month = format(startOfMonth(new Date()), "yyyy-MM-dd")
  const monthLabel = format(new Date(), "MMMM yyyy")

  const { error } = await supabase.from("monthly_cashflow").upsert(
    {
      profile_id: user.profileId,
      month,
      inflow: parsed.amount,
      source: "telegram",
    },
    { onConflict: "profile_id,month" },
  )

  if (error) return `❌ Database error: ${error.message}`

  return `✅ ${user.profileName} inflow set to $${parsed.amount} for ${monthLabel}.`
}
