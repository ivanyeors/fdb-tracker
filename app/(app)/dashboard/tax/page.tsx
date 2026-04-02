import { cookies } from "next/headers"
import { getSessionFromCookies } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { TaxClient, type TaxData } from "./tax-client"

const EMPTY_DATA: TaxData = {
  entries: [],
  reliefs: [],
  profiles: [],
}

export default async function TaxPage() {
  const cookieStore = await cookies()
  const accountId = await getSessionFromCookies(cookieStore)
  if (!accountId) return <TaxClient initialData={EMPTY_DATA} />

  const familyId = cookieStore.get("fdb-active-family-id")?.value ?? null
  const profileId = cookieStore.get("fdb-active-profile-id")?.value ?? null

  const supabase = createSupabaseAdmin()
  const resolved = await resolveFamilyAndProfiles(
    supabase,
    accountId,
    profileId,
    familyId
  )

  if (!resolved) return <TaxClient initialData={EMPTY_DATA} />

  const currentYear = new Date().getFullYear()

  try {
    const url = new URL("/api/tax", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")
    if (profileId) url.searchParams.set("profileId", profileId)
    else if (familyId) url.searchParams.set("familyId", familyId)
    url.searchParams.set("year", String(currentYear))

    const token = cookieStore.get("fdb-session")?.value
    const res = await fetch(url.toString(), {
      headers: token ? { Cookie: `fdb-session=${token}` } : {},
      cache: "no-store",
    })

    if (res.ok) {
      const data: TaxData = await res.json()
      return <TaxClient initialData={data} />
    }
  } catch {
    // fall through with empty data
  }

  return <TaxClient initialData={EMPTY_DATA} />
}
