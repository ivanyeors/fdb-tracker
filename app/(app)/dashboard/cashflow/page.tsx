import { cookies } from "next/headers"
import { getSessionFromCookies } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { fetchCashflowRangeSeries } from "@/lib/api/cashflow-range"
import { CashflowClient } from "./cashflow-client"

function getDateRange() {
  const now = new Date()
  const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  now.setMonth(now.getMonth() - 11)
  const startMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  return { startMonth, endMonth }
}

export default async function CashflowPage() {
  const cookieStore = await cookies()
  const accountId = await getSessionFromCookies(cookieStore)
  if (!accountId) return <CashflowClient initialData={[]} />

  const familyId = cookieStore.get("fdb-active-family-id")?.value ?? null
  const profileId = cookieStore.get("fdb-active-profile-id")?.value ?? null

  const supabase = createSupabaseAdmin()
  const resolved = await resolveFamilyAndProfiles(
    supabase,
    accountId,
    profileId,
    familyId
  )

  if (!resolved) return <CashflowClient initialData={[]} />

  const { startMonth, endMonth } = getDateRange()

  let data: Awaited<ReturnType<typeof fetchCashflowRangeSeries>> = []
  try {
    data = await fetchCashflowRangeSeries(supabase, {
      profileIds: resolved.profileIds,
      familyId: resolved.familyId,
      startMonth,
      endMonth,
    })
  } catch {
    // fall through with empty data
  }
  return <CashflowClient initialData={data} />
}
