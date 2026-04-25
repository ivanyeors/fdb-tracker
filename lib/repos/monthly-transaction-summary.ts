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
  amount: number | null
  amount_enc: string | null
  category_id: string | null
  txn_type: "debit" | "credit"
}

/**
 * Recomputes monthly_transaction_summary rows for the given scope keys by
 * aggregating bank_transactions for each (profile, month, statement_type).
 * Call this after any bulk insert/update/delete of bank_transactions.
 *
 * Decode happens in JS so the same code path works pre- and post-Phase-4
 * drop. The summary holds plaintext sums (per migration 063 design).
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
    const { data: txns, error } = await supabase
      // bank_transactions and monthly_transaction_summary aren't in
      // database.types.ts; cast keeps the call type-safe.
      .from("bank_transactions" as never)
      .select("amount, amount_enc, category_id, txn_type")
      .eq("profile_id", scope.profile_id)
      .eq("month", scope.month)
      .eq("statement_type", scope.statement_type)

    if (error) {
      console.error(
        "[refreshTransactionSummary] fetch failed:",
        scope,
        error.message,
      )
      continue
    }

    const buckets = new Map<
      string | null,
      { debit: number; credit: number; count: number }
    >()
    for (const r of (txns ?? []) as unknown as BankTxnAggRow[]) {
      const decoded = decodeBankTransactionPii({
        amount: r.amount,
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
    if (delErr) {
      console.error(
        "[refreshTransactionSummary] delete failed:",
        scope,
        delErr.message,
      )
      continue
    }

    if (buckets.size === 0) continue

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
    if (insErr) {
      console.error(
        "[refreshTransactionSummary] insert failed:",
        scope,
        insErr.message,
      )
    }
  }
}
