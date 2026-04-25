-- 060_pii_phase3_add.sql
-- PII encryption Phase 3 — financial accounts.
-- Adds *_enc and *_hash columns alongside existing plaintext columns.
-- Reversible until 065_pii_phase3_drop.sql drops the plaintext after soak.
--
-- Scope:
--   bank_accounts.account_number → _enc + _hash + _last4
--     - _enc preserves the original (possibly formatted) account number
--     - _hash is HMAC-SHA256 of the normalized (digits-only) form for dedup
--     - _last4 stores last 4 digits (low-sensitivity, used for masked display)
--   loans.lender    → _enc (TEXT, encrypt only — no lookup)
--   loans.principal → _enc (NUMERIC, encrypted as decimal string)
--
-- investment_accounts has no account_number column today; out of scope.
-- monthly_payment and outstanding are computed on the fly, not stored.
-- The plaintext bank_accounts.account_number index from migration 044 is
-- replaced by an index on account_number_hash; the original is dropped in
-- the Phase 3 cutover migration after soak.

-- ---- bank_accounts ----
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS account_number_enc TEXT,
  ADD COLUMN IF NOT EXISTS account_number_hash TEXT,
  ADD COLUMN IF NOT EXISTS account_number_last4 TEXT;

CREATE INDEX IF NOT EXISTS idx_bank_accounts_account_number_hash
  ON public.bank_accounts(account_number_hash)
  WHERE account_number_hash IS NOT NULL;

-- Family-scoped dedup mirroring the dedup strategy in pdf-scene.ts. Partial
-- so existing nulls don't conflict during dual-write rollout. The plaintext
-- column has no UNIQUE today, so this strengthens the schema; if the import
-- flow later detects a conflict, callers should match on existing rows
-- before insert (which the PDF scene already does via last4 matching).
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_accounts_family_account_number_hash
  ON public.bank_accounts(family_id, account_number_hash)
  WHERE account_number_hash IS NOT NULL;

-- ---- loans ----
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS lender_enc TEXT,
  ADD COLUMN IF NOT EXISTS principal_enc TEXT;

NOTIFY pgrst, 'reload schema';
