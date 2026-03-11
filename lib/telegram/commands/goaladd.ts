import { createSupabaseAdmin } from "@/lib/supabase/server"
import { parseGoalArgs } from "@/lib/telegram/command-parser"
import { resolveUser } from "@/lib/telegram/user-resolver"

export async function handleGoaladd(
  accountId: string,
  text: string,
): Promise<string> {
  const parsed = parseGoalArgs(text)
  if ("error" in parsed) return `❌ ${parsed.error}`

  const user = await resolveUser(parsed.name ?? "", accountId)
  if ("error" in user) return `❌ ${user.error}`

  const supabase = createSupabaseAdmin()

  const { data: goal, error: goalError } = await supabase
    .from("savings_goals")
    .select("id, name, current_amount, target_amount")
    .eq("household_id", accountId)
    .ilike("name", parsed.goal)
    .single()

  if (goalError || !goal) {
    return `❌ Goal '${parsed.goal}' not found.`
  }

  const { error: contribError } = await supabase
    .from("goal_contributions")
    .insert({
      goal_id: goal.id,
      amount: parsed.amount,
      source: "telegram",
    })

  if (contribError) return `❌ Contribution error: ${contribError.message}`

  const newCurrent = goal.current_amount + parsed.amount

  const { error: updateError } = await supabase
    .from("savings_goals")
    .update({ current_amount: newCurrent })
    .eq("id", goal.id)

  if (updateError) return `❌ Update error: ${updateError.message}`

  const pct = goal.target_amount > 0
    ? Math.round((newCurrent / goal.target_amount) * 100)
    : 0

  return `✅ Added $${parsed.amount} to ${goal.name}. Progress: ${pct}% ($${newCurrent}/$${goal.target_amount}).`
}
