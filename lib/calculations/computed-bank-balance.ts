/**
 * Computes bank account balances from cashflow data.
 *
 * Instead of relying on manually entered snapshots, balances are derived:
 *   balance = baseline + sum(monthly net flows)
 *
 * The baseline is either:
 * - The most recent reconciliation snapshot's closing_balance, or
 * - The account's opening_balance (minus locked_amount) if no snapshot exists.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { getEffectiveInflowForProfile } from "@/lib/api/effective-inflow"
import { getEffectiveOutflowForProfile } from "@/lib/api/effective-outflow"
import {
  getGiroDebitForAccount,
  getGiroCreditForAccount,
} from "@/lib/api/giro-amounts"

export type MonthlyAccountFlow = {
  month: string
  inflow: number
  outflow: number
  giroIn: number
  giroOut: number
  netFlow: number
  runningBalance: number
}

export type ComputedAccountBalance = {
  accountId: string
  balance: number
  baselineMonth: string | null
  baselineBalance: number
  monthlyBreakdown: MonthlyAccountFlow[]
}

/**
 * Generate an array of month strings from startMonth to endMonth inclusive.
 * Months are in yyyy-MM-01 format.
 */
function generateMonthsBetween(startMonth: string, endMonth: string): string[] {
  const months: string[] = []
  const [startY, startM] = startMonth.split("-").map(Number) as [number, number]
  const [endY, endM] = endMonth.split("-").map(Number) as [number, number]

  let y = startY
  let m = startM
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, "0")}-01`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return months
}

/**
 * Get the current month in yyyy-MM-01 format.
 */
function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
}

/**
 * Compute the current balance for a single bank account by replaying
 * cashflow from the most recent reconciliation snapshot (or opening balance).
 */
export async function computeAccountBalance(
  supabase: SupabaseClient,
  accountId: string,
  targetMonth?: string,
): Promise<ComputedAccountBalance> {
  const target = targetMonth ?? getCurrentMonth()

  // 1. Fetch the account
  const { data: account } = await supabase
    .from("bank_accounts")
    .select("id, profile_id, opening_balance, locked_amount, family_id")
    .eq("id", accountId)
    .single()

  if (!account) {
    return {
      accountId,
      balance: 0,
      baselineMonth: null,
      baselineBalance: 0,
      monthlyBreakdown: [],
    }
  }

  // 2. Find the profile's primary_bank_account_id
  let primaryAccountId: string | null = null
  if (account.profile_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("primary_bank_account_id")
      .eq("id", account.profile_id)
      .single()
    primaryAccountId = profile?.primary_bank_account_id ?? null
  }

  const isPrimary = primaryAccountId === accountId

  // 3. Find the most recent reconciliation snapshot
  const { data: snapshots } = await supabase
    .from("bank_balance_snapshots")
    .select("month, closing_balance")
    .eq("account_id", accountId)
    .eq("is_reconciliation", true)
    .lte("month", target)
    .order("month", { ascending: false })
    .limit(1)

  const snapshot = snapshots?.[0]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lockedAmount = (account as any).locked_amount ?? 0
  const baselineBalance = snapshot
    ? snapshot.closing_balance
    : (account.opening_balance ?? 0) - lockedAmount
  const baselineMonth = snapshot?.month ?? null

  // 4. Determine the month range to replay
  // If we have a snapshot, start from the month AFTER the snapshot
  // If no snapshot, start from the account's first month (we use a sensible default)
  let startMonth: string
  if (baselineMonth) {
    const [y, m] = baselineMonth.split("-").map(Number) as [number, number]
    const nextM = m === 12 ? 1 : m + 1
    const nextY = m === 12 ? y + 1 : y
    startMonth = `${nextY}-${String(nextM).padStart(2, "0")}-01`
  } else {
    // No snapshot: start from 12 months ago as a reasonable window
    const now = new Date()
    const d = new Date(now.getFullYear(), now.getMonth() - 11, 1)
    startMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
  }

  // If start is after target, no months to replay
  if (startMonth > target) {
    return {
      accountId,
      balance: baselineBalance,
      baselineMonth,
      baselineBalance,
      monthlyBreakdown: [],
    }
  }

  const months = generateMonthsBetween(startMonth, target)

  // 5. Fetch GIRO amounts for this account
  const [giroDebit, giroCredit] = await Promise.all([
    getGiroDebitForAccount(supabase, accountId),
    getGiroCreditForAccount(supabase, accountId),
  ])

  // 6. For each month, compute net flow
  const profileId = account.profile_id
  const breakdown: MonthlyAccountFlow[] = []
  let running = baselineBalance

  for (const month of months) {
    let inflow = 0
    let outflow = 0

    if (profileId && isPrimary) {
      // Primary account gets all cashflow for this profile
      inflow = await getEffectiveInflowForProfile(supabase, profileId, month)
      const eff = await getEffectiveOutflowForProfile(supabase, profileId, month)
      outflow = eff.total
    }

    const giroIn = giroCredit
    const giroOut = giroDebit
    const netFlow = inflow - outflow + giroIn - giroOut

    running += netFlow
    breakdown.push({
      month,
      inflow,
      outflow,
      giroIn,
      giroOut,
      netFlow,
      runningBalance: running,
    })
  }

  return {
    accountId,
    balance: running,
    baselineMonth,
    baselineBalance,
    monthlyBreakdown: breakdown,
  }
}

/**
 * Compute balances for all bank accounts in a family, optionally filtered by profile.
 * Returns one ComputedAccountBalance per account.
 */
export async function computeAllAccountBalances(
  supabase: SupabaseClient,
  familyId: string,
  profileId: string | null,
  targetMonth?: string,
): Promise<ComputedAccountBalance[]> {
  const target = targetMonth ?? getCurrentMonth()

  let query = supabase
    .from("bank_accounts")
    .select("id")
    .eq("family_id", familyId)

  if (profileId) {
    query = query.or(`profile_id.eq.${profileId},profile_id.is.null`)
  }

  const { data: accounts } = await query
  if (!accounts || accounts.length === 0) return []

  const results = await Promise.all(
    accounts.map((a) => computeAccountBalance(supabase, a.id, target)),
  )

  return results
}

/**
 * Compute the total bank balance across all accounts for a family/profile.
 */
export async function computeBankTotal(
  supabase: SupabaseClient,
  familyId: string,
  profileId: string | null,
  targetMonth?: string,
): Promise<number> {
  const balances = await computeAllAccountBalances(
    supabase,
    familyId,
    profileId,
    targetMonth,
  )
  return balances.reduce((sum, b) => sum + Math.max(0, b.balance), 0)
}
