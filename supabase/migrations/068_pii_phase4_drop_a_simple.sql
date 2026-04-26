-- 068_pii_phase4_drop_a_simple.sql
-- Phase 4 drop, stage A — small/simple amount tables.
--
-- DESTRUCTIVE. Drops the plaintext columns whose ciphertext was added in
-- 063_pii_phase4_add.sql. After this migration:
--   * Reads MUST decode *_enc (PR 2 already switched every read path).
--   * Writes that still target the dropped columns will fail. PR 1
--     populates *_enc alongside plaintext; the encoders' patches no
--     longer reference the dropped names so writes continue working.
--
-- Tables in this stage (order: smallest blast radius first):
--   tax_relief_inputs   → drop amount
--   tax_relief_auto     → drop amount
--   income_config       → drop annual_salary, bonus_estimate
--   income_history      → drop monthly_salary
--
-- Prerequisites (RUN FIRST):
--   1. Confirm zero "decrypt failed for ... falling back:" lines in logs
--      since 063 was applied.
--   2. Confirm scripts/backfill-pii-phase4.ts reported 0 failures and
--      every row in these 4 tables has its *_enc populated:
--        SELECT COUNT(*) FROM income_config WHERE annual_salary_enc IS NULL;
--        SELECT COUNT(*) FROM tax_relief_inputs WHERE amount_enc IS NULL;
--        SELECT COUNT(*) FROM tax_relief_auto  WHERE amount_enc IS NULL;
--        SELECT COUNT(*) FROM income_history   WHERE monthly_salary_enc IS NULL
--          AND monthly_salary IS NOT NULL;
--      All must return 0. If not, re-run the backfill before this migration.
--   3. Take a dump scoped to these 4 tables (free-tier substitute for PITR):
--        ./scripts/phase4-pre-drop-dump.sh a
--      Keep the resulting file until the soak after stage E confirms
--      everything is healthy.

ALTER TABLE public.tax_relief_inputs   DROP COLUMN IF EXISTS amount;
ALTER TABLE public.tax_relief_auto     DROP COLUMN IF EXISTS amount;
ALTER TABLE public.income_config       DROP COLUMN IF EXISTS annual_salary;
ALTER TABLE public.income_config       DROP COLUMN IF EXISTS bonus_estimate;
ALTER TABLE public.income_history      DROP COLUMN IF EXISTS monthly_salary;

NOTIFY pgrst, 'reload schema';
