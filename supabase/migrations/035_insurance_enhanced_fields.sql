-- Add enhanced fields to insurance_policies for parity with advisor PDF format.

ALTER TABLE public.insurance_policies
  ADD COLUMN IF NOT EXISTS inception_date DATE,
  ADD COLUMN IF NOT EXISTS cpf_premium NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS premium_waiver BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS remarks TEXT;

COMMENT ON COLUMN public.insurance_policies.inception_date IS
  'Policy start/inception date (not when the record was created in this app).';
COMMENT ON COLUMN public.insurance_policies.cpf_premium IS
  'Annual premium paid via CPF (MediShield Life, DPS). Null means all cash.';
COMMENT ON COLUMN public.insurance_policies.premium_waiver IS
  'Whether the policy includes a premium waiver benefit.';
COMMENT ON COLUMN public.insurance_policies.remarks IS
  'Free-text notes for benefit details (ADL criteria, co-pay caps, deferred periods, etc).';

-- Expand coverage_type CHECK on insurance_policy_coverages to include new types.
ALTER TABLE public.insurance_policy_coverages
  DROP CONSTRAINT IF EXISTS insurance_policy_coverages_coverage_type_check;

ALTER TABLE public.insurance_policy_coverages
  ADD CONSTRAINT insurance_policy_coverages_coverage_type_check
  CHECK (coverage_type IN (
    'death', 'critical_illness', 'early_critical_illness',
    'hospitalization', 'medical_reimbursement',
    'disability', 'personal_accident', 'accident_death_tpd',
    'long_term_care', 'tpd'
  ));

-- Also expand legacy coverage_type CHECK on insurance_policies.
ALTER TABLE public.insurance_policies
  DROP CONSTRAINT IF EXISTS insurance_policies_coverage_type_check;

ALTER TABLE public.insurance_policies
  ADD CONSTRAINT insurance_policies_coverage_type_check
  CHECK (coverage_type IS NULL OR coverage_type IN (
    'death', 'critical_illness', 'early_critical_illness',
    'hospitalization', 'medical_reimbursement',
    'disability', 'personal_accident', 'accident_death_tpd',
    'long_term_care', 'tpd'
  ));
