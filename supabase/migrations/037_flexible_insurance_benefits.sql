-- Flexible insurance benefits: allow arbitrary benefit types per policy
-- while keeping standard coverage_type for gap analysis.

-- 1. Add new columns to insurance_policy_coverages
ALTER TABLE public.insurance_policy_coverages
  ADD COLUMN IF NOT EXISTS benefit_name TEXT,
  ADD COLUMN IF NOT EXISTS benefit_premium NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS renewal_bonus NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS benefit_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS benefit_unit TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

-- 2. Make coverage_type nullable (was NOT NULL)
ALTER TABLE public.insurance_policy_coverages
  ALTER COLUMN coverage_type DROP NOT NULL;

-- 3. Drop old CHECK constraint on coverage_type (from migration 031)
--    and replace with expanded list that also allows NULL
ALTER TABLE public.insurance_policy_coverages
  DROP CONSTRAINT IF EXISTS insurance_policy_coverages_coverage_type_check;

ALTER TABLE public.insurance_policy_coverages
  ADD CONSTRAINT insurance_policy_coverages_coverage_type_check
  CHECK (coverage_type IS NULL OR coverage_type IN (
    'death', 'critical_illness', 'early_critical_illness',
    'hospitalization', 'medical_reimbursement',
    'disability', 'personal_accident', 'accident_death_tpd',
    'long_term_care', 'tpd'
  ));

-- 4. Drop old UNIQUE on (policy_id, coverage_type) — a policy can now have
--    multiple custom benefits with NULL coverage_type
ALTER TABLE public.insurance_policy_coverages
  DROP CONSTRAINT IF EXISTS insurance_policy_coverages_policy_id_coverage_type_key;

-- 5. Add partial unique index: no duplicate benefit names within a policy
CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_coverages_unique_benefit_name
  ON public.insurance_policy_coverages (policy_id, benefit_name)
  WHERE benefit_name IS NOT NULL;

-- 6. Backfill benefit_name from coverage_type labels for existing rows
UPDATE public.insurance_policy_coverages SET benefit_name = CASE coverage_type
  WHEN 'death' THEN 'Death / Life'
  WHEN 'critical_illness' THEN 'Critical Illness'
  WHEN 'early_critical_illness' THEN 'Early Critical Illness'
  WHEN 'hospitalization' THEN 'Hospitalization'
  WHEN 'medical_reimbursement' THEN 'Medical Reimbursement'
  WHEN 'disability' THEN 'Disability Income'
  WHEN 'personal_accident' THEN 'Personal Accident'
  WHEN 'accident_death_tpd' THEN 'Accident Death/TPD'
  WHEN 'long_term_care' THEN 'Long-term Care'
  WHEN 'tpd' THEN 'Total Permanent Disability'
  ELSE coverage_type
END
WHERE benefit_name IS NULL AND coverage_type IS NOT NULL;

COMMENT ON COLUMN public.insurance_policy_coverages.benefit_name IS
  'Free-text benefit name, e.g. "Accidental Death Benefit". Auto-filled from coverage_type label for standard types.';
COMMENT ON COLUMN public.insurance_policy_coverages.benefit_premium IS
  'Per-benefit premium component. Sum of all benefit premiums should equal policy premium_amount.';
COMMENT ON COLUMN public.insurance_policy_coverages.renewal_bonus IS
  'Renewal/loyalty bonus amount added to base coverage.';
COMMENT ON COLUMN public.insurance_policy_coverages.benefit_expiry_date IS
  'Per-benefit expiry date if different from policy-level expiry.';
COMMENT ON COLUMN public.insurance_policy_coverages.benefit_unit IS
  'Unit for income-style benefits, e.g. /week, /month.';
COMMENT ON COLUMN public.insurance_policy_coverages.sort_order IS
  'Display ordering within policy (0 = first).';
