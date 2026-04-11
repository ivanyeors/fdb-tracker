import { cookies } from "next/headers"
import { getSessionFromCookies } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { fetchCashflowRangeSeries } from "@/lib/api/cashflow-range"
import { getCalendarYearRange } from "@/lib/date-range"
import { CashflowClient } from "./cashflow-client"
import type { SpendingBreakdownInitialData } from "@/components/dashboard/cashflow/spending-breakdown-tab"

function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
}

const EMPTY_TRANSACTIONS: SpendingBreakdownInitialData = {
  transactions: [],
  categories: [],
}

export default async function CashflowPage() {
  const cookieStore = await cookies()
  const accountId = await getSessionFromCookies(cookieStore)
  if (!accountId)
    return (
      <CashflowClient
        initialData={[]}
        initialTransactionsData={EMPTY_TRANSACTIONS}
      />
    )

  const familyId = cookieStore.get("fdb-active-family-id")?.value ?? null
  const profileId = cookieStore.get("fdb-active-profile-id")?.value ?? null

  const supabase = createSupabaseAdmin()
  const resolved = await resolveFamilyAndProfiles(
    supabase,
    accountId,
    profileId,
    familyId
  )

  if (!resolved)
    return (
      <CashflowClient
        initialData={[]}
        initialTransactionsData={EMPTY_TRANSACTIONS}
      />
    )

  const { startMonth, endMonth } = getCalendarYearRange()
  const month = getCurrentMonth()

  // Fetch cashflow series AND transactions + categories in parallel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let txnQuery = (supabase as any)
    .from("bank_transactions")
    .select("*, outflow_categories(id, name, icon)")
    .order("txn_date", { ascending: true })
    .eq("month", month)

  if (profileId) {
    txnQuery = txnQuery.eq("profile_id", profileId)
  } else {
    txnQuery = txnQuery.eq("family_id", resolved.familyId)
  }

  const [cashflowResult, txnResult, catResult, rulesResult] = await Promise.all(
    [
      fetchCashflowRangeSeries(supabase, {
        profileIds: resolved.profileIds,
        familyId: resolved.familyId,
        startMonth,
        endMonth,
      }).catch(() => []),
      txnQuery,
      supabase
        .from("outflow_categories")
        .select("id, name, icon")
        .eq("household_id", accountId)
        .order("sort_order", { ascending: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("category_rules")
        .select("match_pattern, category_id, source, priority")
        .eq("household_id", accountId)
        .order("priority", { ascending: false }),
    ]
  )

  return (
    <CashflowClient
      initialData={cashflowResult}
      initialTransactionsData={{
        transactions: txnResult.data ?? [],
        categories: catResult.data ?? [],
        categoryRules: rulesResult.data ?? [],
      }}
    />
  )
}
