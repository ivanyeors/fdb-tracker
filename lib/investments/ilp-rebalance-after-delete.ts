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
    .from("ilp_products")
    .select("id, group_allocation_pct")
    .eq("ilp_fund_group_id", groupId)
    .eq("family_id", familyId)
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

  const ids = members.map((m) => m.id)
  const weights = members.map((m) => Number(m.group_allocation_pct ?? 0))

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

  const items = ids.map((id, i) => ({
    productId: id,
    allocationPct: newPcts[i]!,
  }))

  const groupTotal = Number(group?.group_premium_amount ?? 0)
  const mode = group?.premium_payment_mode ?? "monthly"

  if (mode === "one_time") {
    for (let i = 0; i < ids.length; i++) {
      const { error } = await supabase
        .from("ilp_products")
        .update({
          group_allocation_pct: newPcts[i]!,
          monthly_premium: 0,
          premium_payment_mode: "one_time",
        })
        .eq("id", ids[i]!)
        .eq("family_id", familyId)
      if (error) return { error: error.message }
    }
    return { error: null }
  }

  const derived = deriveMonthlyPremiumsFromGroupTotal(groupTotal, items)
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!
    const mp = derived.get(id) ?? 0
    const { error } = await supabase
      .from("ilp_products")
      .update({
        group_allocation_pct: newPcts[i]!,
        monthly_premium: mp,
        premium_payment_mode: "monthly",
      })
      .eq("id", id)
      .eq("family_id", familyId)
    if (error) return { error: error.message }
  }

  return { error: null }
}
