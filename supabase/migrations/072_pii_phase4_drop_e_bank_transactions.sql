-- 072_pii_phase4_drop_e_bank_transactions.sql
-- Phase 4 drop, stage E — bank_transactions + dedup constraint swap.
--
-- HIGHEST-RISK STAGE. This is the largest table (per migration 063
-- backfill: 860 rows on dev, expected to be the biggest in prod) and
-- the only one with a UNIQUE constraint that references the column
-- being dropped. The legacy UNIQUE was declared inline in
-- 043_bank_transactions_and_category_rules.sql:
--   UNIQUE(profile_id, month, txn_date, description, amount,
--          statement_type)
-- Postgres auto-named it (truncated to 63 chars), so we look it up by
-- column signature and drop it dynamically.
--
-- Sequence:
--   1. Drop the legacy UNIQUE (column signature includes plaintext
--      `amount`).
--   2. Drop the partial idx_bank_txn_dedup_hash from 063 — it had
--      WHERE amount_hash IS NOT NULL because the hash backfill was
--      not yet complete. By stage E the backfill is verified and
--      every row has amount_hash populated.
--   3. Recreate idx_bank_txn_dedup_hash without the WHERE clause so
--      it enforces dedup on every row going forward.
--   4. Drop plaintext amount and balance.
--
-- Prerequisites:
--   1. Stage D (071) ran cleanly; soak window elapsed.
--   2. Decrypt failure logs zero since 063.
--   3. Coverage check (every row must have amount_hash and
--      amount_enc; balance is nullable so check it conditionally):
--        SELECT COUNT(*) FROM bank_transactions WHERE amount_enc  IS NULL;
--        SELECT COUNT(*) FROM bank_transactions WHERE amount_hash IS NULL;
--        SELECT COUNT(*) FROM bank_transactions
--          WHERE balance IS NOT NULL AND balance_enc IS NULL;
--      All three must be 0.
--   4. monthly_transaction_summary trigger from 064 has been firing
--      on production writes for at least one full statement-import
--      cycle (so the rollup is healthy without the plaintext column).
--   5. Take a dump:
--        ./scripts/phase4-pre-drop-dump.sh e

-- ============================================================
-- 1. Drop the legacy plaintext UNIQUE (auto-named, look up by columns)
-- ============================================================
DO $$
DECLARE
  c TEXT;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'public.bank_transactions'::regclass
    AND contype = 'u'
    AND ARRAY(
      SELECT attname FROM pg_attribute
      WHERE attrelid = 'public.bank_transactions'::regclass
        AND attnum = ANY (conkey)
      ORDER BY array_position(conkey, attnum)
    ) = ARRAY[
      'profile_id','month','txn_date','description','amount','statement_type'
    ]::name[];

  IF c IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.bank_transactions DROP CONSTRAINT %I',
      c
    );
  END IF;
END $$;

-- ============================================================
-- 2 + 3. Promote the hash UNIQUE from partial to full
-- ============================================================
DROP INDEX IF EXISTS public.idx_bank_txn_dedup_hash;

CREATE UNIQUE INDEX idx_bank_txn_dedup_hash
  ON public.bank_transactions
    (profile_id, month, txn_date, description, amount_hash, statement_type);

-- ============================================================
-- 4. Drop plaintext columns
-- ============================================================
ALTER TABLE public.bank_transactions DROP COLUMN IF EXISTS amount;
ALTER TABLE public.bank_transactions DROP COLUMN IF EXISTS balance;

NOTIFY pgrst, 'reload schema';
