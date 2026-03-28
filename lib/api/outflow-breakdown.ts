/**
 * Outflow breakdown helper — supports future outflow categories (food, travel, etc.).
 *
 * If outflow_entries exist for a given profile+month, returns per-category breakdown.
 * Otherwise falls back to the single monthly_cashflow.outflow value.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export type OutflowCategoryEntry = {
  categoryId: string | null
  categoryName: string | null
  icon: string | null
  amount: number
  memo: string | null
}

export type OutflowBreakdownResult = {
  total: number
  categories: OutflowCategoryEntry[] | null
}

/**
 * Get the outflow breakdown for a profile in a given month.
 *
 * Returns `categories: null` when no outflow_entries exist (legacy single-value mode).
 * Returns `categories: [...]` when entries exist, with one item per category.
 */
export async function getOutflowBreakdownForProfile(
  supabase: SupabaseClient,
  profileId: string,
  month: string,
): Promise<OutflowBreakdownResult> {
  const monthStr = month.includes("-01") ? month : `${month}-01`

  // Check for categorized entries
  const { data: entries } = await supabase
    .from("outflow_entries")
    .select("category_id, amount, memo")
    .eq("profile_id", profileId)
    .eq("month", monthStr)

  if (entries && entries.length > 0) {
    // Fetch category names for the entries that have a category_id
    const categoryIds = entries
      .map((e) => e.category_id)
      .filter((id): id is string => id != null)

    let categoryMap = new Map<string, { name: string; icon: string | null }>()
    if (categoryIds.length > 0) {
      const { data: categories } = await supabase
        .from("outflow_categories")
        .select("id, name, icon")
        .in("id", categoryIds)

      if (categories) {
        categoryMap = new Map(
          categories.map((c) => [c.id, { name: c.name, icon: c.icon }]),
        )
      }
    }

    const result: OutflowCategoryEntry[] = entries.map((e) => {
      const cat = e.category_id ? categoryMap.get(e.category_id) : null
      return {
        categoryId: e.category_id,
        categoryName: cat?.name ?? null,
        icon: cat?.icon ?? null,
        amount: e.amount,
        memo: e.memo,
      }
    })

    const total = result.reduce((sum, e) => sum + e.amount, 0)
    return { total, categories: result }
  }

  // Fallback: single outflow value from monthly_cashflow
  const { data: cashflow } = await supabase
    .from("monthly_cashflow")
    .select("outflow")
    .eq("profile_id", profileId)
    .eq("month", monthStr)
    .single()

  return {
    total: cashflow?.outflow ?? 0,
    categories: null,
  }
}
