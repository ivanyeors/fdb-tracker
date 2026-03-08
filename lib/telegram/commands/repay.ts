import { format } from "date-fns"

import { createSupabaseAdmin } from "@/lib/supabase/server"
import { parseRepayArgs } from "@/lib/telegram/command-parser"
import { resolveUser } from "@/lib/telegram/user-resolver"

export async function handleRepay(
  householdId: string,
  text: string,
): Promise<string> {
  const parsed = parseRepayArgs(text)
  if ("error" in parsed) return `❌ ${parsed.error}`

  const user = await resolveUser(parsed.name ?? "", householdId)
  if ("error" in user) return `❌ ${user.error}`

  const supabase = createSupabaseAdmin()

  const { data: loan, error: loanError } = await supabase
    .from("loans")
    .select("id, name")
    .eq("profile_id", user.profileId)
    .ilike("name", parsed.loan)
    .single()

  if (loanError || !loan) {
    return `❌ Loan '${parsed.loan}' not found.`
  }

  const today = format(new Date(), "yyyy-MM-dd")

  const { error } = await supabase.from("loan_repayments").insert({
    loan_id: loan.id,
    amount: parsed.amount,
    date: today,
  })

  if (error) return `❌ Database error: ${error.message}`

  return `✅ Repayment of $${parsed.amount} logged for ${loan.name}.`
}
