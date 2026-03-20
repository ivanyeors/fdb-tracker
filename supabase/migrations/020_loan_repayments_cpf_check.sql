-- Ensure cpf_oa_amount never exceeds repayment amount (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loan_repayments_cpf_oa_amount_lte_amount'
  ) THEN
    ALTER TABLE loan_repayments
      ADD CONSTRAINT loan_repayments_cpf_oa_amount_lte_amount
      CHECK (
        cpf_oa_amount IS NULL
        OR (cpf_oa_amount >= 0 AND cpf_oa_amount <= amount)
      );
  END IF;
END $$;
