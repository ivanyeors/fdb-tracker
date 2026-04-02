import { cookies } from "next/headers"
import { getSessionFromCookies } from "@/lib/auth/session"
import {
  InvestmentsClient,
  type InvestmentsInitialData,
} from "./investments-client"

const EMPTY: InvestmentsInitialData = {
  investments: null,
  ilp: null,
  account: null,
  transactions: null,
  fx: null,
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

export default async function InvestmentsPage() {
  const cookieStore = await cookies()
  const accountId = await getSessionFromCookies(cookieStore)
  if (!accountId) return <InvestmentsClient initialData={EMPTY} />

  const familyId = cookieStore.get("fdb-active-family-id")?.value ?? null
  const profileId = cookieStore.get("fdb-active-profile-id")?.value ?? null

  if (!familyId && !profileId)
    return <InvestmentsClient initialData={EMPTY} />

  const token = cookieStore.get("fdb-session")?.value

  const params = new URLSearchParams()
  if (profileId) params.set("profileId", profileId)
  else if (familyId) params.set("familyId", familyId)
  const qs = params.toString()

  let data: InvestmentsInitialData = EMPTY
  try {
    const [invRes, ilpRes, accountRes, txRes, fxRes] = await Promise.all([
      fetchInternal(`/api/investments?${qs}`, token),
      fetchInternal(`/api/investments/ilp?${qs}`, token),
      fetchInternal(`/api/investments/account?${qs}`, token),
      fetchInternal(`/api/investments/transactions?${qs}&limit=100`, token),
      fetchInternal("/api/fx/usd-sgd", token),
    ])

    data = {
      investments: invRes ? await invRes.json() : null,
      ilp: ilpRes ? await ilpRes.json() : null,
      account: accountRes ? await accountRes.json() : null,
      transactions: txRes ? await txRes.json() : null,
      fx: fxRes ? await fxRes.json() : null,
    }
  } catch {
    // fall through with empty data
  }

  return <InvestmentsClient initialData={data} />
}
