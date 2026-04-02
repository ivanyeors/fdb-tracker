import { cookies } from "next/headers"
import { getSessionFromCookies } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { CategoryManagerPage } from "@/components/dashboard/cashflow/category-manager-page"

export default async function CategoriesPage() {
  const cookieStore = await cookies()
  const accountId = await getSessionFromCookies(cookieStore)
  if (!accountId) redirect("/login")

  const supabase = createSupabaseAdmin()

  // Fetch categories with rule counts + all rules in parallel
  const [catResult, rulesResult] = await Promise.all([
    supabase
      .from("outflow_categories")
      .select("id, name, icon, sort_order, is_system, created_at")
      .eq("household_id", accountId)
      .order("sort_order", { ascending: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("category_rules")
      .select("id, match_pattern, category_id, source, priority, created_at")
      .eq("household_id", accountId)
      .order("priority", { ascending: false }),
  ])

  return (
    <CategoryManagerPage
      householdId={accountId}
      initialCategories={catResult.data ?? []}
      initialRules={rulesResult.data ?? []}
    />
  )
}
