import { createSupabaseAdmin } from "@/lib/supabase/server"
import { parseBuySellArgs } from "@/lib/telegram/command-parser"
import { resolveUser } from "@/lib/telegram/user-resolver"
import { calculateWeightedAverageCost } from "@/lib/calculations/investments"

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

  const { data: existing } = await supabase
    .from("investments")
    .select("id, units, cost_basis")
    .eq("family_id", user.familyId)
    .eq("profile_id", user.profileId)
    .eq("symbol", symbol)
    .maybeSingle()

  let investmentId: string

  if (existing) {
    const newCostBasis = calculateWeightedAverageCost(
      existing.units,
      existing.cost_basis,
      parsed.quantity,
      parsed.price,
    )
    const newUnits = existing.units + parsed.quantity

    const { error: updateError } = await supabase
      .from("investments")
      .update({ units: newUnits, cost_basis: newCostBasis })
      .eq("id", existing.id)

    if (updateError) return `❌ Update error: ${updateError.message}`
    investmentId = existing.id
  } else {
    const { data: newHolding, error: insertError } = await supabase
      .from("investments")
      .insert({
        family_id: user.familyId,
        profile_id: user.profileId,
        type: "stock",
        symbol,
        units: parsed.quantity,
        cost_basis: parsed.price,
      })
      .select("id")
      .single()

    if (insertError || !newHolding) return `❌ Insert error: ${insertError?.message}`
    investmentId = newHolding.id
  }

  const { error: txError } = await supabase
    .from("investment_transactions")
    .insert({
      family_id: user.familyId,
      investment_id: investmentId,
      profile_id: user.profileId,
      type: "buy",
      symbol,
      quantity: parsed.quantity,
      price: parsed.price,
      journal_text: parsed.journal,
    })

  if (txError) return `❌ Transaction error: ${txError.message}`

  const accountFilter = {
    family_id: user.familyId,
    profile_id: user.profileId,
  }
  const { data: accountRow } = await supabase
    .from("investment_accounts")
    .select("id, cash_balance")
    .match(accountFilter)
    .maybeSingle()

  if (accountRow) {
    await supabase
      .from("investment_accounts")
      .update({
        cash_balance: accountRow.cash_balance - totalCost,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountRow.id)
  } else {
    await supabase.from("investment_accounts").insert({
      family_id: user.familyId,
      profile_id: user.profileId,
      cash_balance: -totalCost,
      updated_at: new Date().toISOString(),
    })
  }

  return `✅ ${user.profileName} bought ${parsed.quantity} ${symbol} @ $${parsed.price}. Total cost: $${totalCost}.`
}
