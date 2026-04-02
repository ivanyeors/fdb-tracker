import { cookies } from "next/headers"
import { getSessionFromCookies } from "@/lib/auth/session"
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

function getDateRange() {
  const now = new Date()
  const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  now.setMonth(now.getMonth() - 11)
  const startMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  return { startMonth, endMonth }
}

async function fetchInternal(
  path: string,
  token: string | undefined
): Promise<Response | null> {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  try {
    const res = await fetch(`${base}${path}`, {
      headers: token ? { Cookie: `fdb-session=${token}` } : {},
      cache: "no-store",
    })
    return res.ok ? res : null
  } catch {
    return null
  }
}

export default async function OverviewPage() {
  const cookieStore = await cookies()
  const accountId = await getSessionFromCookies(cookieStore)
  if (!accountId) return <OverviewClient initialData={EMPTY} />

  const familyId = cookieStore.get("fdb-active-family-id")?.value ?? null
  const profileId = cookieStore.get("fdb-active-profile-id")?.value ?? null

  if (!familyId && !profileId)
    return <OverviewClient initialData={EMPTY} />

  const token = cookieStore.get("fdb-session")?.value

  const params = new URLSearchParams()
  if (profileId) params.set("profileId", profileId)
  else if (familyId) params.set("familyId", familyId)
  const qs = params.toString()

  const currentMonth = getCurrentMonth()
  const { startMonth, endMonth } = getDateRange()

  let data: OverviewInitialData = EMPTY
  try {
    const [
      overviewRes,
      cashflowRangeRes,
      waterfallRes,
      ilpRes,
      goalsRes,
      insuranceRes,
      txRes,
      historyRes,
    ] = await Promise.all([
      fetchInternal(`/api/overview?${qs}&month=${currentMonth}`, token),
      fetchInternal(
        `/api/cashflow?startMonth=${startMonth}&endMonth=${endMonth}&${qs}`,
        token
      ),
      fetchInternal(`/api/cashflow?month=${currentMonth}&${qs}`, token),
      fetchInternal(`/api/investments/ilp?${qs}`, token),
      fetchInternal(`/api/goals?${qs}`, token),
      fetchInternal(`/api/insurance?${qs}`, token),
      fetchInternal(
        `/api/investments/transactions?${qs}&limit=100`,
        token
      ),
      fetchInternal(
        `/api/investments/history?days=30&${qs}`,
        token
      ),
    ])

    data = {
      overview: overviewRes ? await overviewRes.json() : null,
      cashflowRange: cashflowRangeRes
        ? await cashflowRangeRes.json()
        : null,
      waterfall: waterfallRes ? await waterfallRes.json() : null,
      ilp: ilpRes ? await ilpRes.json() : null,
      goals: goalsRes ? await goalsRes.json() : null,
      insurance: insuranceRes ? await insuranceRes.json() : null,
      transactions: txRes ? await txRes.json() : null,
      investmentHistory: historyRes ? await historyRes.json() : null,
    }
  } catch {
    // fall through with empty data
  }

  return <OverviewClient initialData={data} />
}
