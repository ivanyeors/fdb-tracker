import { cookies } from "next/headers"
import { getSessionFromCookies } from "@/lib/auth/session"
import { CpfClient, type CpfInitialData } from "./cpf-client"

const EMPTY_DATA: CpfInitialData = {
  balances: [],
  retirement: null,
  housing: null,
  loans: [],
}

export default async function CpfPage() {
  const cookieStore = await cookies()
  const accountId = await getSessionFromCookies(cookieStore)
  if (!accountId) return <CpfClient initialData={EMPTY_DATA} />

  const familyId = cookieStore.get("fdb-active-family-id")?.value ?? null
  const profileId = cookieStore.get("fdb-active-profile-id")?.value ?? null

  if (!familyId && !profileId) return <CpfClient initialData={EMPTY_DATA} />

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const token = cookieStore.get("fdb-session")?.value
  const headers: HeadersInit = token
    ? { Cookie: `fdb-session=${token}` }
    : {}

  const qs = profileId
    ? `profileId=${profileId}`
    : `familyId=${familyId}`

  let data: CpfInitialData = EMPTY_DATA
  try {
    const [balancesRes, retirementRes, housingRes, loansRes] =
      await Promise.all([
        fetch(`${baseUrl}/api/cpf/balances?${qs}`, {
          headers,
          cache: "no-store",
        }),
        fetch(`${baseUrl}/api/cpf/retirement?${qs}`, {
          headers,
          cache: "no-store",
        }),
        fetch(`${baseUrl}/api/cpf/housing?${qs}`, {
          headers,
          cache: "no-store",
        }),
        fetch(`${baseUrl}/api/loans?${qs}`, {
          headers,
          cache: "no-store",
        }),
      ])

    data = {
      balances: balancesRes.ok ? ((await balancesRes.json()) ?? []) : [],
      retirement: retirementRes.ok ? await retirementRes.json() : null,
      housing: housingRes.ok ? await housingRes.json() : null,
      loans: loansRes.ok ? ((await loansRes.json()) ?? []) : [],
    }
  } catch {
    // fall through with empty data
  }

  return <CpfClient initialData={data} />
}
