-- 063_pii_phase4_add.sql
-- PII encryption Phase 4 — financial amounts.
-- Adds *_enc columns alongside existing plaintext numeric/JSONB columns
-- across the 11 tables that hold per-profile financial figures.
-- Reversible until 068_pii_phase4_drop.sql drops the plaintext after soak.
--
-- Encryption format:
--   *_enc  → "v1:<base64(iv|ct|tag)>" via lib/crypto/cipher (AES-256-GCM,
--            AAD bound to "{table}:{column}")
--   *_hash → hex HMAC-SHA256 via lib/crypto/hash, used for dedup where the
--            existing UNIQUE constraint references the now-encrypted column
--
-- Numeric values are serialized as decimal strings before encryption to
-- avoid float-precision drift on round-trip (see lib/crypto/cipher.encryptNumber).
--
-- Scope (one section per table; numeric columns unless noted):
--   bank_transactions     → amount, balance + amount_hash (mirrors UNIQUE)
--   monthly_cashflow      → inflow, outflow
--   income_config         → annual_salary, bonus_estimate
--   income_history        → monthly_salary
--   cpf_balances          → oa, sa, ma
--   cpf_healthcare_config → msl_annual_override, csl_annual,
--                           csl_supplement_annual, isp_annual
--   tax_noa_data          → employment_income, chargeable_income,
--                           total_deductions, donations_deduction,
--                           reliefs_total, tax_payable,
--                           reliefs_json, bracket_summary_json (JSONB)
--   tax_giro_schedule     → schedule (JSONB), total_payable,
--                           outstanding_balance
--   tax_relief_inputs     → amount
--   tax_relief_auto       → amount
--   insurance_policies    → premium_amount, coverage_amount
--
-- Also creates monthly_transaction_summary — a per-(profile, month,
-- statement_type, category) pre-aggregated rollup of bank_transactions.
-- This lets dashboards render monthly totals without scanning and
-- decrypting every transaction. The summary holds plaintext sums (NOT
-- encrypted) — a deliberate trade-off: aggregates are coarser-grained
-- than per-row amounts, and the decrypt-on-render path on a 12-month
-- dashboard would otherwise be O(transactions) instead of O(months ×
-- categories). Population happens in PR 3 (read switchover); rows are
-- maintained on bank_transactions insert/update/delete via the same
-- writers that produce the ciphertext.

-- ============================================================
-- bank_transactions
-- ============================================================
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS amount_enc TEXT,
  ADD COLUMN IF NOT EXISTS amount_hash TEXT,
  ADD COLUMN IF NOT EXISTS balance_enc TEXT;

-- Mirrors UNIQUE(profile_id, month, txn_date, description, amount,
-- statement_type) from migration 043. Partial — only enforced once
-- amount_hash is populated. The plaintext UNIQUE remains until the
-- Phase 4 drop migration removes the plaintext amount column.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_txn_dedup_hash
  ON public.bank_transactions
    (profile_id, month, txn_date, description, amount_hash, statement_type)
  WHERE amount_hash IS NOT NULL;

-- ============================================================
-- monthly_cashflow
-- ============================================================
ALTER TABLE public.monthly_cashflow
  ADD COLUMN IF NOT EXISTS inflow_enc TEXT,
  ADD COLUMN IF NOT EXISTS outflow_enc TEXT;

-- ============================================================
-- income_config
-- ============================================================
ALTER TABLE public.income_config
  ADD COLUMN IF NOT EXISTS annual_salary_enc TEXT,
  ADD COLUMN IF NOT EXISTS bonus_estimate_enc TEXT;

-- ============================================================
-- income_history
-- ============================================================
ALTER TABLE public.income_history
  ADD COLUMN IF NOT EXISTS monthly_salary_enc TEXT;

-- ============================================================
-- cpf_balances
-- ============================================================
ALTER TABLE public.cpf_balances
  ADD COLUMN IF NOT EXISTS oa_enc TEXT,
  ADD COLUMN IF NOT EXISTS sa_enc TEXT,
  ADD COLUMN IF NOT EXISTS ma_enc TEXT;

-- ============================================================
-- cpf_healthcare_config
-- ============================================================
ALTER TABLE public.cpf_healthcare_config
  ADD COLUMN IF NOT EXISTS msl_annual_override_enc TEXT,
  ADD COLUMN IF NOT EXISTS csl_annual_enc TEXT,
  ADD COLUMN IF NOT EXISTS csl_supplement_annual_enc TEXT,
  ADD COLUMN IF NOT EXISTS isp_annual_enc TEXT;

-- ============================================================
-- tax_noa_data
-- ============================================================
ALTER TABLE public.tax_noa_data
  ADD COLUMN IF NOT EXISTS employment_income_enc TEXT,
  ADD COLUMN IF NOT EXISTS chargeable_income_enc TEXT,
  ADD COLUMN IF NOT EXISTS total_deductions_enc TEXT,
  ADD COLUMN IF NOT EXISTS donations_deduction_enc TEXT,
  ADD COLUMN IF NOT EXISTS reliefs_total_enc TEXT,
  ADD COLUMN IF NOT EXISTS tax_payable_enc TEXT,
  ADD COLUMN IF NOT EXISTS reliefs_json_enc TEXT,
  ADD COLUMN IF NOT EXISTS bracket_summary_json_enc TEXT;

-- ============================================================
-- tax_giro_schedule
-- ============================================================
ALTER TABLE public.tax_giro_schedule
  ADD COLUMN IF NOT EXISTS schedule_enc TEXT,
  ADD COLUMN IF NOT EXISTS total_payable_enc TEXT,
  ADD COLUMN IF NOT EXISTS outstanding_balance_enc TEXT;

-- ============================================================
-- tax_relief_inputs
-- ============================================================
ALTER TABLE public.tax_relief_inputs
  ADD COLUMN IF NOT EXISTS amount_enc TEXT;

-- ============================================================
-- tax_relief_auto
-- ============================================================
ALTER TABLE public.tax_relief_auto
  ADD COLUMN IF NOT EXISTS amount_enc TEXT;

-- ============================================================
-- insurance_policies
-- ============================================================
ALTER TABLE public.insurance_policies
  ADD COLUMN IF NOT EXISTS premium_amount_enc TEXT,
  ADD COLUMN IF NOT EXISTS coverage_amount_enc TEXT;

-- ============================================================
-- monthly_transaction_summary (new pre-aggregated rollup)
-- ============================================================
-- Populated by the write path on bank_transactions (PR 3); read by
-- dashboard endpoints that previously did SUM over the full table.
-- Plaintext on purpose — see header comment.
CREATE TABLE IF NOT EXISTS public.monthly_transaction_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  month TEXT NOT NULL,                                      -- 'YYYY-MM'
  statement_type TEXT NOT NULL CHECK (statement_type IN ('bank', 'cc')),
  category_id UUID REFERENCES public.outflow_categories(id) ON DELETE SET NULL,
  debit_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  txn_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per (profile, month, statement_type, category). Uncategorized
-- rows hash to a single row with category_id IS NULL — the partial
-- index covers the typical lookup; the full UNIQUE handles the rest
-- because Postgres treats NULLs as distinct in a multi-column UNIQUE,
-- which is the behavior we want here (uncategorized rolls up alongside
-- categorized totals via aggregation in the API layer, not the DB).
CREATE UNIQUE INDEX IF NOT EXISTS idx_mts_profile_month_type_cat
  ON public.monthly_transaction_summary
    (profile_id, month, statement_type, category_id)
  WHERE category_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mts_profile_month_type_uncat
  ON public.monthly_transaction_summary
    (profile_id, month, statement_type)
  WHERE category_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_mts_family_month
  ON public.monthly_transaction_summary(family_id, month);

ALTER TABLE public.monthly_transaction_summary ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'monthly_transaction_summary_profile'
  ) THEN
    CREATE POLICY "monthly_transaction_summary_profile"
      ON public.monthly_transaction_summary
      FOR ALL USING (profile_id IN (SELECT id FROM public.profiles));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
