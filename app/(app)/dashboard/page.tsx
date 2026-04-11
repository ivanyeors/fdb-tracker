import { cookies } from "next/headers"
import { getSessionFromCookies } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { fetchOverviewData } from "@/lib/api/overview-data"
import { fetchCashflowRangeSeries } from "@/lib/api/cashflow-range"
import { getCalendarYearRange } from "@/lib/date-range"
import { fetchSingleMonthCashflow } from "@/lib/api/cashflow-single-month"
import { fetchIlpProducts } from "@/lib/api/ilp-data"
import { fetchGoals } from "@/lib/api/goals-data"
import { fetchInsurancePolicies } from "@/lib/api/insurance-data"
import { fetchTransactions } from "@/lib/api/transactions-data"
import { fetchInvestmentHistory } from "@/lib/api/investment-history-data"
import {
  OverviewClient,
  type OverviewInitialData,
} from "./overview-client"

const EMPTY: OverviewInitialData = {
  overview: null,
  cashflowRange: null,
  waterfall: null,
  ilp: null,
  goals: null,
  insurance: null,
  transactions: null,
  investmentHistory: null,
}

function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
}


export default async function OverviewPage() {
  const cookieStore = await cookies()
  const accountId = await getSessionFromCookies(cookieStore)
  if (!accountId) return <OverviewClient initialData={EMPTY} />

  const familyId = cookieStore.get("fdb-active-family-id")?.value ?? null
  const profileId = cookieStore.get("fdb-active-profile-id")?.value ?? null

  if (!familyId && !profileId)
    return <OverviewClient initialData={EMPTY} />

  const supabase = createSupabaseAdmin()
  const resolved = await resolveFamilyAndProfiles(
    supabase,
    accountId,
    profileId,
    familyId
  )
  if (!resolved) return <OverviewClient initialData={EMPTY} />

  const currentMonth = getCurrentMonth()
  const { startMonth, endMonth } = getCalendarYearRange()

  let data: OverviewInitialData = EMPTY
  try {
    const [
      overview,
      cashflowRange,
      waterfall,
      ilp,
      goals,
      insurance,
      transactions,
      investmentHistory,
    ] = await Promise.all([
      fetchOverviewData(supabase, {
        profileIds: resolved.profileIds,
        familyId: resolved.familyId,
        profileId,
        monthFilter: currentMonth,
      }).catch(() => null),
      fetchCashflowRangeSeries(supabase, {
        profileIds: resolved.profileIds,
        familyId: resolved.familyId,
        startMonth,
        endMonth,
      }).catch(() => null),
      fetchSingleMonthCashflow(supabase, {
        profileIds: resolved.profileIds,
        familyId: resolved.familyId,
        month: currentMonth,
      }).catch(() => null),
      fetchIlpProducts(supabase, {
        familyId: resolved.familyId,
        profileId,
      }).catch(() => null),
      fetchGoals(supabase, {
        familyId: resolved.familyId,
        profileId,
      }).catch(() => null),
      fetchInsurancePolicies(supabase, {
        profileIds: resolved.profileIds,
      }).catch(() => null),
      fetchTransactions(supabase, {
        familyId: resolved.familyId,
        profileId,
        limit: 100,
      }).catch(() => null),
      fetchInvestmentHistory(supabase, {
        familyId: resolved.familyId,
        profileId,
        days: 30,
      }).catch(() => null),
    ])

    data = {
      overview,
      cashflowRange,
      waterfall,
      ilp,
      goals,
      insurance,
      transactions,
      investmentHistory,
    }
  } catch {
    // fall through with empty data
  }

  return <OverviewClient initialData={data} />
}
