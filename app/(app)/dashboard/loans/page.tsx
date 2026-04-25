import { cookies } from "next/headers"
import { getSessionFromCookies } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { decodeLoanPii } from "@/lib/repos/loans"
import { LoansClient, type LoansInitialData } from "./loans-client"

const EMPTY: LoansInitialData = {
  loans: [],
  repayments: [],
  earlyRepayments: [],
}

export default async function LoansPage() {
  const cookieStore = await cookies()
  const accountId = await getSessionFromCookies(cookieStore)
  if (!accountId) return <LoansClient initialData={EMPTY} />

  const familyId = cookieStore.get("fdb-active-family-id")?.value ?? null
  const profileId = cookieStore.get("fdb-active-profile-id")?.value ?? null

  if (!familyId && !profileId) return <LoansClient initialData={EMPTY} />

  const supabase = createSupabaseAdmin()
  const resolved = await resolveFamilyAndProfiles(
    supabase,
    accountId,
    profileId,
    familyId
  )
  if (!resolved) return <LoansClient initialData={EMPTY} />

  const { profileIds } = resolved
  const profileIdList = profileIds.join(",")

  try {
    const { data: loans } = await supabase
      .from("loans")
      .select("*")
      .or(
        `profile_id.in.(${profileIdList}),split_profile_id.in.(${profileIdList})`
      )
      .order("created_at", { ascending: true })

    const loanList = (loans ?? []).map((l) => {
      const decoded = decodeLoanPii(l)
      return { ...l, lender: decoded.lender, principal: decoded.principal ?? 0 }
    })
    const loanIds = loanList.map((l: { id: string }) => l.id)

    let repayments: Array<{ loan_id: string; amount: number; date: string }> =
      []
    let earlyRepayments: Array<{
      loan_id: string
      amount: number
      date: string
    }> = []

    if (loanIds.length > 0) {
      const [repayRes, earlyRes] = await Promise.all([
        supabase
          .from("loan_repayments")
          .select("loan_id, amount, date")
          .in("loan_id", loanIds)
          .order("date", { ascending: true }),
        supabase
          .from("loan_early_repayments")
          .select("loan_id, amount, date")
          .in("loan_id", loanIds)
          .order("date", { ascending: true }),
      ])

      for (const row of repayRes.data ?? []) {
        repayments.push({
          loan_id: row.loan_id,
          amount: Number(row.amount),
          date: row.date,
        })
      }
      for (const row of earlyRes.data ?? []) {
        earlyRepayments.push({
          loan_id: row.loan_id,
          amount: Number(row.amount),
          date: row.date,
        })
      }
    }

    return (
      <LoansClient
        initialData={{
          loans: loanList,
          repayments,
          earlyRepayments,
        }}
      />
    )
  } catch {
    return <LoansClient initialData={EMPTY} />
  }
}
