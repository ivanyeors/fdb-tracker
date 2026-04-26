-- 071_pii_phase4_drop_d_cashflow_insurance.sql
-- Phase 4 drop, stage D — monthly_cashflow + insurance_policies.
--
-- DESTRUCTIVE. Drops the plaintext columns whose ciphertext was added
-- in 063_pii_phase4_add.sql.
--
-- Tables:
--   monthly_cashflow    → drop inflow, outflow
--   insurance_policies  → drop premium_amount, coverage_amount
--
-- These are user-visible on the cashflow + insurance dashboards. Confirm
-- both pages render correctly (numbers match what you saw before stage
-- A) before promoting this migration to prod.
--
-- Prerequisites:
--   1. Stage C (070) ran cleanly; soak window elapsed.
--   2. Decrypt failure logs zero since 063.
--   3. Coverage check (only rows where plaintext was set):
--        SELECT COUNT(*) FROM monthly_cashflow
--          WHERE (inflow  IS NOT NULL AND inflow_enc  IS NULL)
--             OR (outflow IS NOT NULL AND outflow_enc IS NULL);
--        SELECT COUNT(*) FROM insurance_policies
--          WHERE (premium_amount  IS NOT NULL AND premium_amount_enc  IS NULL)
--             OR (coverage_amount IS NOT NULL AND coverage_amount_enc IS NULL);
--      Both must be 0.
--   4. Take a dump:
--        ./scripts/phase4-pre-drop-dump.sh d

ALTER TABLE public.monthly_cashflow    DROP COLUMN IF EXISTS inflow;
ALTER TABLE public.monthly_cashflow    DROP COLUMN IF EXISTS outflow;

ALTER TABLE public.insurance_policies  DROP COLUMN IF EXISTS premium_amount;
ALTER TABLE public.insurance_policies  DROP COLUMN IF EXISTS coverage_amount;

NOTIFY pgrst, 'reload schema';
