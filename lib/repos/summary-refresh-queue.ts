import {
  refreshOneSummaryScope,
  type SummaryScope,
} from "@/lib/repos/monthly-transaction-summary"
import type { createSupabaseAdmin } from "@/lib/supabase/server"

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>

interface QueueRow {
  profile_id: string
  family_id: string
  month: string
  statement_type: "bank" | "cc"
  enqueued_at: string
  claimed_at: string | null
}

interface DrainOpts {
  /**
   * Restrict the drain to specific scopes (used inline after a known write
   * so the user sees fresh totals in the same response). Omit to drain all
   * pending rows (cron sweep mode).
   */
  scopes?: SummaryScope[]
  /** Max queue rows to process in this call. */
  limit?: number
  /** Claims older than this are reset to NULL before draining. */
  staleClaimMinutes?: number
}

export interface DrainResult {
  processed: number
  failed: number
  staleReset: number
}

/**
 * Drains pending rows from summary_refresh_queue by recomputing
 * monthly_transaction_summary for each scope. The trigger on
 * bank_transactions enqueues atomically with the write, so this drainer
 * never needs to "catch up" — it just processes what the trigger left.
 *
 * Concurrency: claimed_at marks rows in flight. Stale claims (>5 min) are
 * reset on each pass so a crashed drainer doesn't strand work. Refresh is
 * idempotent (replace strategy), so accidental double-processing is safe.
 *
 * Delete on success uses an enqueued_at guard: if a new write enqueued
 * the same scope while we were processing, we leave the row for the next
 * pass instead of deleting the newer enqueue.
 */
export async function drainSummaryRefreshQueue(
  supabase: SupabaseAdmin,
  opts: DrainOpts = {},
): Promise<DrainResult> {
  const limit = opts.limit ?? 200
  const staleMinutes = opts.staleClaimMinutes ?? 5

  // 1. Reset stale claims (a previous drainer crashed mid-flight).
  const staleCutoff = new Date(
    Date.now() - staleMinutes * 60_000,
  ).toISOString()
  const { count: staleReset, error: staleErr } = await supabase
    .from("summary_refresh_queue" as never)
    .update({ claimed_at: null } as never, { count: "exact" })
    .lt("claimed_at", staleCutoff)
  if (staleErr) {
    console.error(
      "[drainSummaryRefreshQueue] stale-claim sweep failed:",
      staleErr.message,
    )
  }

  // 2. Select pending rows. Restrict to caller-provided scopes if given.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let qb: any = (supabase as any)
    .from("summary_refresh_queue")
    .select("profile_id, family_id, month, statement_type, enqueued_at, claimed_at")
    .is("claimed_at", null)
    .limit(limit)

  if (opts.scopes && opts.scopes.length > 0) {
    const orFilter = opts.scopes
      .map(
        (s) =>
          `and(profile_id.eq.${s.profile_id},month.eq.${s.month},statement_type.eq.${s.statement_type})`,
      )
      .join(",")
    qb = qb.or(orFilter)
  }

  const { data: pending, error: selErr } = (await qb) as {
    data: QueueRow[] | null
    error: { message: string } | null
  }

  if (selErr) {
    console.error(
      "[drainSummaryRefreshQueue] select failed:",
      selErr.message,
    )
    return { processed: 0, failed: 0, staleReset: staleReset ?? 0 }
  }
  if (!pending || pending.length === 0) {
    return { processed: 0, failed: 0, staleReset: staleReset ?? 0 }
  }

  // 3. Claim + process + delete each row in turn.
  const claimedAt = new Date().toISOString()
  let processed = 0
  let failed = 0

  for (const row of pending) {
    // Atomic claim: only succeeds if claimed_at is still NULL.
    const { data: claimed, error: claimErr } = await supabase
      .from("summary_refresh_queue" as never)
      .update({ claimed_at: claimedAt } as never)
      .eq("profile_id", row.profile_id)
      .eq("month", row.month)
      .eq("statement_type", row.statement_type)
      .is("claimed_at", null)
      .select()
    if (claimErr || !claimed || (claimed as unknown[]).length === 0) {
      // Someone else claimed it (or it was deleted). Skip.
      continue
    }

    try {
      await refreshOneSummaryScope(supabase, {
        profile_id: row.profile_id,
        family_id: row.family_id,
        month: row.month,
        statement_type: row.statement_type,
      })
      // Only delete if no newer enqueue happened. enqueued_at uses now()
      // server-side; if the trigger re-fired during our processing, the
      // ON CONFLICT path bumped enqueued_at and our delete misses,
      // leaving the (now un-claimed) row for the next drainer pass.
      await supabase
        .from("summary_refresh_queue" as never)
        .delete()
        .eq("profile_id", row.profile_id)
        .eq("month", row.month)
        .eq("statement_type", row.statement_type)
        .eq("enqueued_at", row.enqueued_at)
      processed += 1
    } catch (err) {
      console.error(
        "[drainSummaryRefreshQueue] refresh failed:",
        {
          profile_id: row.profile_id,
          month: row.month,
          statement_type: row.statement_type,
        },
        err instanceof Error ? err.message : err,
      )
      failed += 1
      // Leave claimed_at set; stale-claim sweep will re-eligibilize the
      // row after staleClaimMinutes so the next drainer retries.
    }
  }

  return { processed, failed, staleReset: staleReset ?? 0 }
}
