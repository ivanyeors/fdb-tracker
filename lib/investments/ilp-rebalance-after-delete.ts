import type { SupabaseClient } from "@supabase/supabase-js"
import {
  ILP_GROUP_ALLOCATION_EPSILON,
  normalizeProportionalTo100,
  split100Across,
  sumAllocationPcts,
} from "@/lib/investments/ilp-group-allocation"
import { deriveMonthlyPremiumsFromGroupTotal } from "@/lib/investments/ilp-premium-derive"

/**
 * After deleting one product in a fund group, renormalize remaining members' allocation %,
 * derive monthly premiums from the group total when mode is monthly, and remove an empty group row.
 * Uses ilp_fund_group_members junction table for membership queries.
 */
export async function rebalanceIlpFundGroupAfterProductDelete(
  supabase: SupabaseClient,
  familyId: string,
  groupId: string
): Promise<{ error: string | null }> {
  const { data: group } = await supabase
    .from("ilp_fund_groups")
    .select("id, group_premium_amount, premium_payment_mode")
    .eq("id", groupId)
    .eq("family_id", familyId)
    .maybeSingle()

  const { data: members, error: membersErr } = await supabase
    .from("ilp_fund_group_members")
    .select("id, product_id, allocation_pct")
    .eq("fund_group_id", groupId)
    .order("created_at", { ascending: true })

  if (membersErr) {
    return { error: membersErr.message }
  }

  if (!members || members.length === 0) {
    if (group) {
      const { error } = await supabase
        .from("ilp_fund_groups")
        .delete()
        .eq("id", groupId)
        .eq("family_id", familyId)
      if (error) return { error: error.message }
    }
    return { error: null }
  }

  const memberIds = members.map((m) => m.id)
  const productIds = members.map((m) => m.product_id)
  const weights = members.map((m) => Number(m.allocation_pct ?? 0))

  let newPcts: number[]
  if (members.length === 1) {
    newPcts = [100]
  } else {
    const wsum = sumAllocationPcts(weights)
    if (wsum <= ILP_GROUP_ALLOCATION_EPSILON) {
      newPcts = split100Across(members.length)
    } else {
      newPcts = normalizeProportionalTo100(weights)
    }
  }

  const items = productIds.map((pid, i) => ({
    productId: pid,
    allocationPct: newPcts[i],
  }))

  const groupTotal = Number(group?.group_premium_amount ?? 0)
  const mode = group?.premium_payment_mode ?? "monthly"

  // Update allocation percentages on junction table
  for (let i = 0; i < memberIds.length; i++) {
    const { error } = await supabase
      .from("ilp_fund_group_members")
      .update({ allocation_pct: newPcts[i] })
      .eq("id", memberIds[i])
    if (error) return { error: error.message }
  }

  // Update product premiums
  if (mode === "one_time") {
    for (const pid of productIds) {
      const { error } = await supabase
        .from("ilp_products")
        .update({
          monthly_premium: 0,
          premium_payment_mode: "one_time",
        })
        .eq("id", pid)
        .eq("family_id", familyId)
      if (error) return { error: error.message }
    }
    return { error: null }
  }

  const derived = deriveMonthlyPremiumsFromGroupTotal(groupTotal, items)
  for (const pid of productIds) {
    const mp = derived.get(pid) ?? 0
    const { error } = await supabase
      .from("ilp_products")
      .update({
        monthly_premium: mp,
        premium_payment_mode: "monthly",
      })
      .eq("id", pid)
      .eq("family_id", familyId)
    if (error) return { error: error.message }
  }

  return { error: null }
}
