-- Expand insurance_policies type constraint for Singapore market
ALTER TABLE public.insurance_policies
  DROP CONSTRAINT IF EXISTS insurance_policies_type_check;

ALTER TABLE public.insurance_policies
  ADD CONSTRAINT insurance_policies_type_check
  CHECK (type IN (
    'term_life', 'whole_life', 'universal_life',
    'integrated_shield',
    'critical_illness', 'early_critical_illness', 'multi_pay_ci',
    'endowment', 'ilp', 'personal_accident',
    'disability_income', 'long_term_care', 'tpd'
  ));

-- Expand coverage_type constraint
ALTER TABLE public.insurance_policies
  DROP CONSTRAINT IF EXISTS insurance_policies_coverage_type_check;

ALTER TABLE public.insurance_policies
  ADD CONSTRAINT insurance_policies_coverage_type_check
  CHECK (coverage_type IS NULL OR coverage_type IN (
    'death', 'critical_illness', 'hospitalization',
    'disability', 'personal_accident', 'long_term_care', 'tpd'
  ));

-- New metadata columns
ALTER TABLE public.insurance_policies
  ADD COLUMN IF NOT EXISTS sub_type TEXT,
  ADD COLUMN IF NOT EXISTS rider_name TEXT,
  ADD COLUMN IF NOT EXISTS rider_premium NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS insurer TEXT,
  ADD COLUMN IF NOT EXISTS policy_number TEXT,
  ADD COLUMN IF NOT EXISTS maturity_value NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS cash_value NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS coverage_till_age INT
    CHECK (coverage_till_age IS NULL OR coverage_till_age > 0);

COMMENT ON COLUMN public.insurance_policies.sub_type IS
  'Sub-classification. For ISP: ward_a, ward_b1, private. For CI: early, multi_pay.';
COMMENT ON COLUMN public.insurance_policies.rider_name IS
  'Rider attached to the policy (e.g., ISP rider name).';
COMMENT ON COLUMN public.insurance_policies.rider_premium IS
  'Separate premium for the rider component.';
COMMENT ON COLUMN public.insurance_policies.insurer IS
  'Insurance company name.';
COMMENT ON COLUMN public.insurance_policies.policy_number IS
  'Policy number for reference.';
COMMENT ON COLUMN public.insurance_policies.maturity_value IS
  'Expected maturity payout for endowment plans.';
COMMENT ON COLUMN public.insurance_policies.cash_value IS
  'Current cash/surrender value for whole life and endowment.';
COMMENT ON COLUMN public.insurance_policies.coverage_till_age IS
  'Age at which coverage expires.';

-- Expand coverage benchmarks for new types
ALTER TABLE public.insurance_coverage_benchmarks
  ADD COLUMN IF NOT EXISTS tpd_coverage_target NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS long_term_care_monthly_target NUMERIC(14,2) DEFAULT 0;
