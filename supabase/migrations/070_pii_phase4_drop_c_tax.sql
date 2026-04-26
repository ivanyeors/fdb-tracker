-- 070_pii_phase4_drop_c_tax.sql
-- Phase 4 drop, stage C — tax tables (numeric + JSONB columns).
--
-- DESTRUCTIVE. Drops the plaintext columns whose ciphertext was added
-- in 063_pii_phase4_add.sql.
--
-- Tables:
--   tax_noa_data       → drop employment_income, chargeable_income,
--                              total_deductions, donations_deduction,
--                              reliefs_total, tax_payable,
--                              reliefs_json, bracket_summary_json
--   tax_giro_schedule  → drop schedule, total_payable, outstanding_balance
--
-- Of note: reliefs_json, bracket_summary_json, schedule were JSONB before
-- and are now stored as ciphertext under the *_enc TEXT columns. Anything
-- that previously did `SELECT reliefs_json->>'foo'` in SQL must be
-- decoded in JS instead — PR 2 already switched all such reads.
--
-- Prerequisites:
--   1. Stage B (069) ran cleanly; soak window elapsed.
--   2. Decrypt failure logs zero since 063.
--   3. Coverage check (only rows where plaintext was set):
--        SELECT COUNT(*) FROM tax_noa_data
--          WHERE employment_income_enc    IS NULL
--             OR chargeable_income_enc    IS NULL
--             OR total_deductions_enc     IS NULL
--             OR donations_deduction_enc  IS NULL
--             OR reliefs_total_enc        IS NULL
--             OR tax_payable_enc          IS NULL
--             OR reliefs_json_enc         IS NULL
--             OR bracket_summary_json_enc IS NULL;
--        SELECT COUNT(*) FROM tax_giro_schedule
--          WHERE schedule_enc            IS NULL
--             OR total_payable_enc       IS NULL
--             OR outstanding_balance_enc IS NULL;
--      Both must be 0 for rows that exist (these tables had 0 rows on
--      dev — verify on prod before proceeding).
--   4. Take a dump:
--        ./scripts/phase4-pre-drop-dump.sh c

ALTER TABLE public.tax_noa_data       DROP COLUMN IF EXISTS employment_income;
ALTER TABLE public.tax_noa_data       DROP COLUMN IF EXISTS chargeable_income;
ALTER TABLE public.tax_noa_data       DROP COLUMN IF EXISTS total_deductions;
ALTER TABLE public.tax_noa_data       DROP COLUMN IF EXISTS donations_deduction;
ALTER TABLE public.tax_noa_data       DROP COLUMN IF EXISTS reliefs_total;
ALTER TABLE public.tax_noa_data       DROP COLUMN IF EXISTS tax_payable;
ALTER TABLE public.tax_noa_data       DROP COLUMN IF EXISTS reliefs_json;
ALTER TABLE public.tax_noa_data       DROP COLUMN IF EXISTS bracket_summary_json;

ALTER TABLE public.tax_giro_schedule  DROP COLUMN IF EXISTS schedule;
ALTER TABLE public.tax_giro_schedule  DROP COLUMN IF EXISTS total_payable;
ALTER TABLE public.tax_giro_schedule  DROP COLUMN IF EXISTS outstanding_balance;

NOTIFY pgrst, 'reload schema';
