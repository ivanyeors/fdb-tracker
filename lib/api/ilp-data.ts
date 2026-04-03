import type { SupabaseClient } from "@supabase/supabase-js"

export async function fetchIlpProducts(
  supabase: SupabaseClient,
  params: { familyId: string; profileId: string | null }
) {
  const { familyId, profileId } = params

  // When filtering by profile, also include products belonging to groups
  // assigned to that profile (group-level profile_id).
  let groupProductIds: string[] = []
  if (profileId) {
    const { data: profileGroups } = await supabase
      .from("ilp_fund_groups")
      .select("id")
      .eq("family_id", familyId)
      .eq("profile_id", profileId)

    if (profileGroups && profileGroups.length > 0) {
      const groupIds = profileGroups.map((g) => g.id)
      const { data: groupMembers } = await supabase
        .from("ilp_fund_group_members")
        .select("product_id")
        .in("fund_group_id", groupIds)

      if (groupMembers) {
        groupProductIds = groupMembers.map((m) => m.product_id)
      }
    }
  }

  let query = supabase
    .from("ilp_products")
    .select("*")
    .eq("family_id", familyId)
    .order("created_at", { ascending: true })

  if (profileId) {
    if (groupProductIds.length > 0) {
      query = query.or(
        `profile_id.eq.${profileId},profile_id.is.null,id.in.(${groupProductIds.join(",")})`,
      )
    } else {
      query = query.or(
        `profile_id.eq.${profileId},profile_id.is.null`,
      )
    }
  }

  const { data: products, error } = await query

  if (error) throw new Error("Failed to fetch ILP products")

  if (!products || products.length === 0) return []

  const productIds = products.map((p) => p.id)

  const [{ data: memberships }, { data: allEntries, error: entriesError }] =
    await Promise.all([
      supabase
        .from("ilp_fund_group_members")
        .select(
          "id, fund_group_id, product_id, allocation_pct, ilp_fund_groups ( id, name, group_premium_amount, premium_payment_mode, profile_id )"
        )
        .in("product_id", productIds),
      supabase
        .from("ilp_entries")
        .select("*")
        .in("product_id", productIds)
        .order("month", { ascending: false }),
    ])

  if (entriesError) throw new Error("Failed to fetch ILP entries")

  const membershipsByProduct = new Map<string, typeof memberships>()
  for (const m of memberships ?? []) {
    const list = membershipsByProduct.get(m.product_id) ?? []
    list.push(m)
    membershipsByProduct.set(m.product_id, list)
  }

  const latestEntryByProduct = new Map<
    string,
    (typeof allEntries)[number]
  >()
  const entriesByProduct = new Map<
    string,
    (typeof allEntries)[number][]
  >()
  for (const entry of allEntries) {
    if (!latestEntryByProduct.has(entry.product_id)) {
      latestEntryByProduct.set(entry.product_id, entry)
    }
    const list = entriesByProduct.get(entry.product_id) ?? []
    list.push(entry)
    entriesByProduct.set(entry.product_id, list)
  }

  const result = products.map((product) => {
    const entries = (entriesByProduct.get(product.id) ?? []).sort(
      (a, b) => a.month.localeCompare(b.month),
    )
    const productMemberships = membershipsByProduct.get(product.id) ?? []
    const fundGroupMemberships = productMemberships.map((m) => {
      const g = m.ilp_fund_groups as unknown as {
        id: string
        name: string
        group_premium_amount: number | null
        premium_payment_mode: string
        profile_id: string | null
      } | null
      return {
        id: m.id,
        group_id: g?.id ?? m.fund_group_id,
        group_name: g?.name ?? "",
        allocation_pct: Number(m.allocation_pct),
        group_premium_amount: g?.group_premium_amount ?? null,
        premium_payment_mode: g?.premium_payment_mode ?? "monthly",
        group_profile_id: g?.profile_id ?? null,
      }
    })

    return {
      ...product,
      fund_group_memberships: fundGroupMemberships,
      latestEntry: latestEntryByProduct.get(product.id) ?? null,
      entries: entries.map((e) => ({
        month: e.month,
        fund_value: e.fund_value,
        premiums_paid: e.premiums_paid ?? null,
        fund_report_snapshot: e.fund_report_snapshot ?? null,
      })),
    }
  })

  // Post-filter: exclude products claimed by groups assigned to a DIFFERENT profile.
  if (profileId) {
    return result.filter((item) => {
      if (item.profile_id != null) return true
      const groupProfileIds = item.fund_group_memberships
        .map((m: { group_profile_id: string | null }) => m.group_profile_id)
        .filter((pid: string | null): pid is string => pid != null)
      if (groupProfileIds.length === 0) return true
      return groupProfileIds.includes(profileId)
    })
  }

  return result
}
