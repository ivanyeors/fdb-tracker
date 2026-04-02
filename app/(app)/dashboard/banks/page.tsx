import { cookies } from "next/headers"
import { getSessionFromCookies } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { fetchOcbc360DerivedForAccount } from "@/lib/api/ocbc360-derived"
import { computeAccountBalance } from "@/lib/calculations/computed-bank-balance"
import { BanksClient } from "./banks-client"

export default async function BanksPage() {
  const cookieStore = await cookies()
  const accountId = await getSessionFromCookies(cookieStore)
  if (!accountId) return <BanksClient initialData={[]} />

  const familyId = cookieStore.get("fdb-active-family-id")?.value ?? null
  const profileId = cookieStore.get("fdb-active-profile-id")?.value ?? null

  const supabase = createSupabaseAdmin()
  const resolved = await resolveFamilyAndProfiles(
    supabase,
    accountId,
    profileId,
    familyId,
  )

  if (!resolved) return <BanksClient initialData={[]} />

  try {
    let query = supabase
      .from("bank_accounts")
      .select("*")
      .eq("family_id", resolved.familyId)
      .order("created_at", { ascending: true })

    if (profileId) {
      query = query.or(`profile_id.eq.${profileId},profile_id.is.null`)
    }

    const { data: accounts, error } = await query
    if (error || !accounts) return <BanksClient initialData={[]} />

    const ocbcAccountIds = accounts
      .filter((a) => a.account_type === "ocbc_360")
      .map((a) => a.id)

    const [ocbcConfigResult, computedBalances] = await Promise.all([
      ocbcAccountIds.length > 0
        ? supabase
            .from("bank_account_ocbc360_config")
            .select("*")
            .in("account_id", ocbcAccountIds)
        : Promise.resolve({ data: null }),
      Promise.all(
        accounts.map((a) => computeAccountBalance(supabase, a.id)),
      ),
    ])

    const ocbcConfigs: Record<string, Record<string, unknown>> = {}
    if (ocbcConfigResult.data) {
      for (const config of ocbcConfigResult.data) {
        ocbcConfigs[config.account_id] = config
      }
    }

    const balanceByAccount = new Map(
      computedBalances.map((b) => [b.accountId, b.balance]),
    )

    const result = await Promise.all(
      accounts.map(async (account) => {
        const latest_balance =
          balanceByAccount.get(account.id) ?? Number(account.opening_balance)
        if (account.account_type !== "ocbc_360") {
          return { ...account, latest_balance }
        }
        const derived = await fetchOcbc360DerivedForAccount(
          supabase,
          {
            id: account.id,
            profile_id: account.profile_id,
            opening_balance: Number(account.opening_balance),
          },
          ocbcConfigs[account.id] ?? null,
          latest_balance,
          profileId,
        )
        return {
          ...account,
          latest_balance,
          ocbc360Config: ocbcConfigs[account.id] ?? null,
          ocbc360Derived: derived,
        }
      }),
    )

    return <BanksClient initialData={result} />
  } catch {
    return <BanksClient initialData={[]} />
  }
}
