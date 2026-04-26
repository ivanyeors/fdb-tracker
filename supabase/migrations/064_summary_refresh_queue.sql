-- 064_summary_refresh_queue.sql
-- Hybrid outbox for monthly_transaction_summary refresh.
--
-- Phase 4 PR 1 wired refreshTransactionSummary() into 5 paths that mutate
-- bank_transactions, but the txn write and the summary refresh are not in a
-- shared transaction — Supabase JS has no multi-statement txn API. A request
-- that crashes between the two leaves the summary stale, and the JS-side
-- refresh swallows errors silently. Migration 063 stated the writers maintain
-- the rollup atomically; that contract was broken in practice.
--
-- This migration adds:
--   1. summary_refresh_queue — a small outbox table keyed by
--      (profile_id, month, statement_type). Each row means "this scope's
--      summary may be stale; recompute it."
--   2. enqueue_summary_refresh() trigger on bank_transactions —
--      INSERT/UPDATE/DELETE atomically inserts a queue row in the same
--      Postgres transaction as the bank_transactions DML. ON CONFLICT
--      bumps enqueued_at and clears claimed_at so a fresh write supersedes
--      any in-flight claim.
--
-- The JS drainer (lib/repos/summary-refresh-queue.ts) processes pending
-- rows synchronously after each write, and a Vercel cron sweeps the queue
-- every 5 minutes to catch anything missed (process crash, network error,
-- decryption failure). refreshTransactionSummary itself is unchanged —
-- it remains the aggregation engine; the queue only ensures it gets
-- invoked durably.

-- ============================================================
-- Queue table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.summary_refresh_queue (
  profile_id UUID NOT NULL,
  family_id UUID NOT NULL,
  month TEXT NOT NULL,                                 -- 'YYYY-MM-DD' (first of month)
  statement_type TEXT NOT NULL CHECK (statement_type IN ('bank', 'cc')),
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  PRIMARY KEY (profile_id, month, statement_type)
);

-- Drainer scans pending (claimed_at IS NULL) and stale-claim sweep scans
-- claimed_at older than 5 min. Compound index serves both.
CREATE INDEX IF NOT EXISTS idx_summary_refresh_queue_pending
  ON public.summary_refresh_queue (claimed_at NULLS FIRST, enqueued_at);

ALTER TABLE public.summary_refresh_queue ENABLE ROW LEVEL SECURITY;
-- No policies: service-role writers (admin client) bypass RLS. No
-- application code other than the drainer/trigger should touch this table.

-- ============================================================
-- Trigger: enqueue on bank_transactions DML
-- ============================================================
CREATE OR REPLACE FUNCTION public.enqueue_summary_refresh()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
BEGIN
  -- For DELETE we need OLD; for INSERT/UPDATE we need NEW (latest scope).
  IF TG_OP = 'DELETE' THEN
    r := OLD;
  ELSE
    r := NEW;
  END IF;

  INSERT INTO public.summary_refresh_queue
    (profile_id, family_id, month, statement_type)
  VALUES (r.profile_id, r.family_id, r.month, r.statement_type)
  ON CONFLICT (profile_id, month, statement_type) DO UPDATE
    SET enqueued_at = now(),
        claimed_at = NULL;

  -- If an UPDATE moved the row across (profile, month, statement_type),
  -- the OLD scope also needs a recompute. Enqueue both.
  IF TG_OP = 'UPDATE' AND (
       OLD.profile_id     IS DISTINCT FROM NEW.profile_id
    OR OLD.month          IS DISTINCT FROM NEW.month
    OR OLD.statement_type IS DISTINCT FROM NEW.statement_type
  ) THEN
    INSERT INTO public.summary_refresh_queue
      (profile_id, family_id, month, statement_type)
    VALUES (OLD.profile_id, OLD.family_id, OLD.month, OLD.statement_type)
    ON CONFLICT (profile_id, month, statement_type) DO UPDATE
      SET enqueued_at = now(),
          claimed_at = NULL;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS bank_transactions_enqueue_summary
  ON public.bank_transactions;

CREATE TRIGGER bank_transactions_enqueue_summary
AFTER INSERT OR UPDATE OR DELETE ON public.bank_transactions
FOR EACH ROW EXECUTE FUNCTION public.enqueue_summary_refresh();

NOTIFY pgrst, 'reload schema';
