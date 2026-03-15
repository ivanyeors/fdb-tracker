import { createSupabaseAdmin } from "@/lib/supabase/server"
import { parseBuySellArgs } from "@/lib/telegram/command-parser"
import { resolveUser } from "@/lib/telegram/user-resolver"

export async function handleSell(
  accountId: string,
  text: string,
): Promise<string> {
  const parsed = parseBuySellArgs(text)
  if ("error" in parsed) return `❌ ${parsed.error}`

  const user = await resolveUser(parsed.name ?? "", accountId)
  if ("error" in user) return `❌ ${user.error}`

  const supabase = createSupabaseAdmin()
  const symbol = parsed.symbol.toUpperCase()
  const proceeds = parsed.quantity * parsed.price

  const { data: existing, error: fetchError } = await supabase
    .from("investments")
    .select("id, units, cost_basis")
    .eq("family_id", user.familyId)
    .eq("profile_id", user.profileId)
    .eq("symbol", symbol)
    .single()

  if (fetchError || !existing) {
    return `❌ No holdings found for ${symbol}.`
  }

  if (existing.units < parsed.quantity) {
    return `❌ Insufficient holdings. ${user.profileName} has ${existing.units} ${symbol}.`
  }

  const remainingUnits = existing.units - parsed.quantity

  const { error: updateError } = await supabase
    .from("investments")
    .update({ units: remainingUnits })
    .eq("id", existing.id)

  if (updateError) return `❌ Update error: ${updateError.message}`

  const { error: txError } = await supabase
    .from("investment_transactions")
    .insert({
      family_id: user.familyId,
      investment_id: existing.id,
      profile_id: user.profileId,
      type: "sell",
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
        cash_balance: accountRow.cash_balance + proceeds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountRow.id)
  } else {
    await supabase.from("investment_accounts").insert({
      family_id: user.familyId,
      profile_id: user.profileId,
      cash_balance: proceeds,
      updated_at: new Date().toISOString(),
    })
  }

  return `✅ ${user.profileName} sold ${parsed.quantity} ${symbol} @ $${parsed.price}. Proceeds: $${proceeds}.`
}
