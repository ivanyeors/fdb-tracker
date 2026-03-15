/**
 * Helpers to compute GIRO amounts for cashflow and bank balance.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

const GIRO_OUTFLOW_DESTINATIONS = [
  "outflow",
  "investments",
  "cpf_investments",
  "srs",
] as const

/**
 * Sum of GIRO amounts that count as outflow for a profile in a given month.
 * Uses source bank account's profile_id to attribute.
 */
export async function getGiroOutflowForProfile(
  supabase: SupabaseClient,
  profileId: string,
): Promise<number> {
  const { data: rules } = await supabase
    .from("giro_rules")
    .select("id, amount, source_bank_account_id")
    .eq("is_active", true)
    .in("destination_type", [...GIRO_OUTFLOW_DESTINATIONS])

  if (!rules || rules.length === 0) return 0

  const accountIds = [...new Set(rules.map((r) => r.source_bank_account_id))]
  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("id, profile_id")
    .in("id", accountIds)

  const profileAccountIds = new Set(
    (accounts ?? [])
      .filter((a) => a.profile_id === profileId)
      .map((a) => a.id),
  )

  return rules
    .filter((r) => profileAccountIds.has(r.source_bank_account_id))
    .reduce((sum, r) => sum + r.amount, 0)
}

/**
 * GIRO debit (outflow) for a bank account per month.
 */
export async function getGiroDebitForAccount(
  supabase: SupabaseClient,
  accountId: string,
): Promise<number> {
  const { data: rules } = await supabase
    .from("giro_rules")
    .select("amount")
    .eq("source_bank_account_id", accountId)
    .eq("is_active", true)

  if (!rules) return 0
  return rules.reduce((sum, r) => sum + r.amount, 0)
}

/**
 * GIRO credit (inflow) for a bank account per month when destination is bank_account.
 */
export async function getGiroCreditForAccount(
  supabase: SupabaseClient,
  accountId: string,
): Promise<number> {
  const { data: rules } = await supabase
    .from("giro_rules")
    .select("amount")
    .eq("destination_bank_account_id", accountId)
    .eq("destination_type", "bank_account")
    .eq("is_active", true)

  if (!rules) return 0
  return rules.reduce((sum, r) => sum + r.amount, 0)
}
