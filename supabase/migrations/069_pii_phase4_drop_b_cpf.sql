-- 069_pii_phase4_drop_b_cpf.sql
-- Phase 4 drop, stage B — CPF tables.
--
-- DESTRUCTIVE. Drops the plaintext columns whose ciphertext was added
-- in 063_pii_phase4_add.sql.
--
-- Tables:
--   cpf_balances           → drop oa, sa, ma
--   cpf_healthcare_config  → drop msl_annual_override, csl_annual,
--                                 csl_supplement_annual, isp_annual
--
-- Prerequisites:
--   1. Stage A (068) ran cleanly; soak window since elapsed (≥3 days
--      recommended).
--   2. Decrypt failure logs zero since 063.
--   3. Coverage check returns 0 for all of:
--        SELECT COUNT(*) FROM cpf_balances WHERE oa_enc IS NULL;
--        SELECT COUNT(*) FROM cpf_balances WHERE sa_enc IS NULL;
--        SELECT COUNT(*) FROM cpf_balances WHERE ma_enc IS NULL;
--        SELECT COUNT(*) FROM cpf_healthcare_config
--          WHERE csl_annual_enc IS NULL
--             OR csl_supplement_annual_enc IS NULL
--             OR isp_annual_enc IS NULL;
--      (msl_annual_override is nullable — only check rows where the
--       plaintext is set:
--        SELECT COUNT(*) FROM cpf_healthcare_config
--          WHERE msl_annual_override IS NOT NULL
--            AND msl_annual_override_enc IS NULL;)
--   4. Take a dump:
--        ./scripts/phase4-pre-drop-dump.sh b

ALTER TABLE public.cpf_balances           DROP COLUMN IF EXISTS oa;
ALTER TABLE public.cpf_balances           DROP COLUMN IF EXISTS sa;
ALTER TABLE public.cpf_balances           DROP COLUMN IF EXISTS ma;

ALTER TABLE public.cpf_healthcare_config  DROP COLUMN IF EXISTS msl_annual_override;
ALTER TABLE public.cpf_healthcare_config  DROP COLUMN IF EXISTS csl_annual;
ALTER TABLE public.cpf_healthcare_config  DROP COLUMN IF EXISTS csl_supplement_annual;
ALTER TABLE public.cpf_healthcare_config  DROP COLUMN IF EXISTS isp_annual;

NOTIFY pgrst, 'reload schema';
