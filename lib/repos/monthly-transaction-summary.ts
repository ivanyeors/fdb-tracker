import { decodeBankTransactionPii } from "@/lib/repos/bank-transactions"
import type { createSupabaseAdmin } from "@/lib/supabase/server"

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>

export interface SummaryScope {
  profile_id: string
  family_id: string
  month: string
  statement_type: "bank" | "cc"
}

interface BankTxnAggRow {
  amount_enc: string | null
  category_id: string | null
  txn_type: "debit" | "credit"
}

/**
 * Recomputes monthly_transaction_summary for one scope. Throws on any DB
 * error so callers can decide whether to retry or leave the queue row
 * claimed for the next sweep. Decode happens in JS so the same code path
 * works pre- and post-Phase-4 drop.
 */
export async function refreshOneSummaryScope(
  supabase: SupabaseAdmin,
  scope: SummaryScope,
): Promise<void> {
  const { data: txns, error } = await supabase
    // bank_transactions and monthly_transaction_summary aren't in
    // database.types.ts; cast keeps the call type-safe.
    .from("bank_transactions" as never)
    .select("amount_enc, category_id, txn_type")
    .eq("profile_id", scope.profile_id)
    .eq("month", scope.month)
    .eq("statement_type", scope.statement_type)
  if (error) throw new Error(`fetch txns: ${error.message}`)

  const buckets = new Map<
    string | null,
    { debit: number; credit: number; count: number }
  >()
  for (const r of (txns ?? []) as unknown as BankTxnAggRow[]) {
    const decoded = decodeBankTransactionPii({
      amount_enc: r.amount_enc,
    })
    const amount = Math.abs(decoded.amount ?? 0)
    const cid = r.category_id ?? null
    const b = buckets.get(cid) ?? { debit: 0, credit: 0, count: 0 }
    if (r.txn_type === "credit") b.credit += amount
    else b.debit += amount
    b.count += 1
    buckets.set(cid, b)
  }

  // Replace strategy: delete existing summary rows for this scope, then
  // re-insert. Cheaper than computing per-cell deltas, correct under
  // concurrent writes (the next caller will recompute from current state).
  const { error: delErr } = await supabase
    .from("monthly_transaction_summary" as never)
    .delete()
    .eq("profile_id", scope.profile_id)
    .eq("month", scope.month)
    .eq("statement_type", scope.statement_type)
  if (delErr) throw new Error(`delete summary: ${delErr.message}`)

  if (buckets.size === 0) return

  const rows = Array.from(buckets.entries()).map(([category_id, b]) => ({
    profile_id: scope.profile_id,
    family_id: scope.family_id,
    month: scope.month,
    statement_type: scope.statement_type,
    category_id,
    debit_total: Math.round(b.debit * 100) / 100,
    credit_total: Math.round(b.credit * 100) / 100,
    txn_count: b.count,
    updated_at: new Date().toISOString(),
  }))

  const { error: insErr } = await supabase
    .from("monthly_transaction_summary" as never)
    .insert(rows as never)
  if (insErr) throw new Error(`insert summary: ${insErr.message}`)
}

/**
 * Recomputes monthly_transaction_summary rows for the given scope keys.
 * Errors are swallowed per-scope so a single bad scope can't poison a
 * batch. Prefer drainSummaryRefreshQueue (lib/repos/summary-refresh-queue)
 * over calling this directly — it provides durability via the outbox.
 */
export async function refreshTransactionSummary(
  supabase: SupabaseAdmin,
  scopes: SummaryScope[],
): Promise<void> {
  const dedup = new Map<string, SummaryScope>()
  for (const s of scopes) {
    dedup.set(`${s.profile_id}|${s.month}|${s.statement_type}`, s)
  }
  for (const scope of dedup.values()) {
    try {
      await refreshOneSummaryScope(supabase, scope)
    } catch (err) {
      console.error(
        "[refreshTransactionSummary] failed:",
        scope,
        err instanceof Error ? err.message : err,
      )
    }
  }
}
