import { createSupabaseAdmin } from "@/lib/supabase/server"
import { parseBuySellArgs } from "@/lib/telegram/command-parser"
import { resolveUser } from "@/lib/telegram/user-resolver"

export async function handleBuy(
  accountId: string,
  text: string,
): Promise<string> {
  const parsed = parseBuySellArgs(text)
  if ("error" in parsed) return `❌ ${parsed.error}`

  const user = await resolveUser(parsed.name ?? "", accountId)
  if ("error" in user) return `❌ ${user.error}`

  const supabase = createSupabaseAdmin()
  const symbol = parsed.symbol.toUpperCase()
  const totalCost = parsed.quantity * parsed.price

  const { error: txError } = await supabase
    .from("investment_transactions")
    .insert({
      household_id: accountId,
      profile_id: user.profileId,
      type: "buy",
      symbol,
      quantity: parsed.quantity,
      price: parsed.price,
      journal_text: parsed.journal,
    })

  if (txError) return `❌ Transaction error: ${txError.message}`

  const { data: existing } = await supabase
    .from("investments")
    .select("id, units, cost_basis")
    .eq("household_id", accountId)
    .eq("profile_id", user.profileId)
    .eq("symbol", symbol)
    .single()

  if (existing) {
    const newUnits = existing.units + parsed.quantity
    const newCostBasis = existing.cost_basis + totalCost

    const { error: updateError } = await supabase
      .from("investments")
      .update({ units: newUnits, cost_basis: newCostBasis })
      .eq("id", existing.id)

    if (updateError) return `❌ Update error: ${updateError.message}`
  } else {
    const { error: insertError } = await supabase.from("investments").insert({
      household_id: accountId,
      profile_id: user.profileId,
      type: "stock",
      symbol,
      units: parsed.quantity,
      cost_basis: totalCost,
    })

    if (insertError) return `❌ Insert error: ${insertError.message}`
  }

  return `✅ ${user.profileName} bought ${parsed.quantity} ${symbol} @ $${parsed.price}. Total cost: $${totalCost}.`
}
