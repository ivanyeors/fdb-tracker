import { cookies } from "next/headers"
import { getSessionFromCookies } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import {
  TransactionsClient,
  type TransactionsInitialData,
} from "./transactions-client"

function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
}

const EMPTY: TransactionsInitialData = {
  transactions: [],
  categories: [],
}

export default async function TransactionsPage() {
  const cookieStore = await cookies()
  const accountId = await getSessionFromCookies(cookieStore)
  if (!accountId) return <TransactionsClient initialData={EMPTY} />

  const familyId = cookieStore.get("fdb-active-family-id")?.value ?? null
  const profileId = cookieStore.get("fdb-active-profile-id")?.value ?? null

  if (!familyId && !profileId) return <TransactionsClient initialData={EMPTY} />

  const supabase = createSupabaseAdmin()
  const resolved = await resolveFamilyAndProfiles(
    supabase,
    accountId,
    profileId,
    familyId,
  )
  if (!resolved) return <TransactionsClient initialData={EMPTY} />

  const month = getCurrentMonth()

  try {
    // Fetch transactions and categories in parallel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let qb = (supabase as any)
      .from("bank_transactions")
      .select("*, outflow_categories(id, name, icon)")
      .order("txn_date", { ascending: true })
      .eq("month", month)

    if (profileId) {
      qb = qb.eq("profile_id", profileId)
    } else {
      qb = qb.eq("family_id", resolved.familyId)
    }

    const categoriesPromise = supabase
      .from("outflow_categories")
      .select("id, name, icon")
      .order("name", { ascending: true })

    const [txnResult, catResult] = await Promise.all([qb, categoriesPromise])

    return (
      <TransactionsClient
        initialData={{
          transactions: txnResult.data ?? [],
          categories: catResult.data ?? [],
        }}
      />
    )
  } catch {
    return <TransactionsClient initialData={EMPTY} />
  }
}
