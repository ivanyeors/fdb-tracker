-- Feature 1: HDB Loan Split Between Couples + Rate Increase
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS split_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS split_pct NUMERIC(5,2) DEFAULT 100
    CHECK (split_pct >= 0 AND split_pct <= 100),
  ADD COLUMN IF NOT EXISTS rate_increase_pct NUMERIC(5,4);

COMMENT ON COLUMN public.loans.split_profile_id IS
  'Partner profile for split housing loans. NULL = no split.';
COMMENT ON COLUMN public.loans.split_pct IS
  'Primary profile share %. Partner gets (100 - split_pct). Default 100 = no split.';
COMMENT ON COLUMN public.loans.rate_increase_pct IS
  'Annual interest rate increase in percentage points (e.g., 0.1 for +0.1%/yr).';

-- Feature 3: Early Repayment Options (HDB vs Private)
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS property_type TEXT
    CHECK (property_type IS NULL OR property_type IN ('hdb', 'private')),
  ADD COLUMN IF NOT EXISTS lock_in_end_date DATE,
  ADD COLUMN IF NOT EXISTS early_repayment_penalty_pct NUMERIC(5,2)
    CHECK (early_repayment_penalty_pct IS NULL OR early_repayment_penalty_pct >= 0),
  ADD COLUMN IF NOT EXISTS max_annual_prepayment_pct NUMERIC(5,2)
    CHECK (max_annual_prepayment_pct IS NULL OR
           (max_annual_prepayment_pct > 0 AND max_annual_prepayment_pct <= 100));

COMMENT ON COLUMN public.loans.property_type IS
  'hdb or private. Only for housing loans. NULL for non-housing.';
COMMENT ON COLUMN public.loans.lock_in_end_date IS
  'End date of lock-in period. Private property loans may have 2-5 year lock-in.';
COMMENT ON COLUMN public.loans.early_repayment_penalty_pct IS
  'Early repayment penalty % (e.g., 1.5). Applied during lock-in period.';
COMMENT ON COLUMN public.loans.max_annual_prepayment_pct IS
  'Max % of outstanding balance that can be prepaid per year (e.g., 50).';

ALTER TABLE public.loan_early_repayments
  ADD COLUMN IF NOT EXISTS penalty_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'cash'
    CHECK (source IN ('cash', 'cpf_oa'));

CREATE INDEX IF NOT EXISTS idx_loans_split_profile_id ON loans(split_profile_id);
