-- 010_add_srs_account_type.sql
-- Add SRS (Supplementary Retirement Scheme) as a valid bank account type.
-- SRS accounts are opened with banks (DBS, OCBC, UOB), hold retirement savings,
-- are investable, and qualify for tax relief (up to $15,300).

ALTER TABLE public.bank_accounts DROP CONSTRAINT IF EXISTS bank_accounts_account_type_check;
ALTER TABLE public.bank_accounts ADD CONSTRAINT bank_accounts_account_type_check
  CHECK (account_type IN ('ocbc_360', 'basic', 'savings', 'fixed_deposit', 'srs'));
