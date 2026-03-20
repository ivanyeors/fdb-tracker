-- CPF housing usage extensions, loan valuation for 120% VL, repayment CPF split, DPS projection toggle
-- Idempotent: safe for db push if a prior attempt partially applied or constraint/column already exists.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS dps_include_in_projection BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS valuation_limit NUMERIC(14, 2) NULL;

ALTER TABLE loan_repayments
  ADD COLUMN IF NOT EXISTS cpf_oa_amount NUMERIC(14, 2) NULL;

ALTER TABLE cpf_housing_usage
  ADD COLUMN IF NOT EXISTS usage_type TEXT NULL;

ALTER TABLE cpf_housing_usage
  ADD COLUMN IF NOT EXISTS loan_repayment_id UUID NULL;

-- Check constraint (add only if missing — avoids duplicate-constraint errors on re-run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cpf_housing_usage_usage_type_check'
  ) THEN
    ALTER TABLE cpf_housing_usage
      ADD CONSTRAINT cpf_housing_usage_usage_type_check
      CHECK (
        usage_type IS NULL
        OR usage_type IN ('downpayment', 'monthly', 'stamp_duty', 'legal', 'hps', 'other')
      );
  END IF;
END $$;

-- FK for loan_repayment_id (column added above without FK so IF NOT EXISTS is reliable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cpf_housing_usage_loan_repayment_id_fkey'
  ) THEN
    ALTER TABLE cpf_housing_usage
      ADD CONSTRAINT cpf_housing_usage_loan_repayment_id_fkey
      FOREIGN KEY (loan_repayment_id) REFERENCES loan_repayments (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cpf_housing_usage_loan_repayment_id ON cpf_housing_usage (loan_repayment_id);

COMMENT ON COLUMN loans.valuation_limit IS 'Lower of purchase price or valuation for CPF housing 120% VL cap; user-entered estimate.';
COMMENT ON COLUMN profiles.dps_include_in_projection IS 'If true, project DPS premiums as OA deductions (ages 21–65).';
