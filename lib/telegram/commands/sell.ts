import { createSupabaseAdmin } from "@/lib/supabase/server"
import { parseBuySellArgs } from "@/lib/telegram/command-parser"
import { resolveUser } from "@/lib/telegram/user-resolver"

export async function handleSell(
  householdId: string,
  text: string,
): Promise<string> {
  const parsed = parseBuySellArgs(text)
  if ("error" in parsed) return `❌ ${parsed.error}`

  const user = await resolveUser(parsed.name ?? "", householdId)
  if ("error" in user) return `❌ ${user.error}`

  const supabase = createSupabaseAdmin()
  const symbol = parsed.symbol.toUpperCase()
  const proceeds = parsed.quantity * parsed.price

  const { data: existing, error: fetchError } = await supabase
    .from("investments")
    .select("id, units, cost_basis")
    .eq("household_id", householdId)
    .eq("profile_id", user.profileId)
    .eq("symbol", symbol)
    .single()

  if (fetchError || !existing) {
    return `❌ No holdings found for ${symbol}.`
  }

  if (existing.units < parsed.quantity) {
    return `❌ Insufficient holdings. ${user.profileName} has ${existing.units} ${symbol}.`
  }

  const { error: txError } = await supabase
    .from("investment_transactions")
    .insert({
      household_id: householdId,
      profile_id: user.profileId,
      type: "sell",
      symbol,
      quantity: parsed.quantity,
      price: parsed.price,
      journal_text: parsed.journal,
    })

  if (txError) return `❌ Transaction error: ${txError.message}`

  const remainingUnits = existing.units - parsed.quantity
  const newCostBasis =
    existing.units > 0
      ? existing.cost_basis * (remainingUnits / existing.units)
      : 0

  const { error: updateError } = await supabase
    .from("investments")
    .update({ units: remainingUnits, cost_basis: newCostBasis })
    .eq("id", existing.id)

  if (updateError) return `❌ Update error: ${updateError.message}`

  return `✅ ${user.profileName} sold ${parsed.quantity} ${symbol} @ $${parsed.price}. Proceeds: $${proceeds}.`
}
