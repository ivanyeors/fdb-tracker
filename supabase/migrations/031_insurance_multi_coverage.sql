-- Multi-coverage per insurance policy.
-- A single policy can now provide multiple coverage types (e.g. death + CI).

CREATE TABLE public.insurance_policy_coverages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES public.insurance_policies(id) ON DELETE CASCADE,
  coverage_type TEXT NOT NULL CHECK (coverage_type IN (
    'death', 'critical_illness', 'hospitalization',
    'disability', 'personal_accident', 'long_term_care', 'tpd'
  )),
  coverage_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(policy_id, coverage_type)
);

ALTER TABLE public.insurance_policy_coverages ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_policy_coverages_policy_id ON public.insurance_policy_coverages(policy_id);
CREATE INDEX idx_policy_coverages_type ON public.insurance_policy_coverages(coverage_type);

-- Backfill from existing insurance_policies rows
INSERT INTO public.insurance_policy_coverages (policy_id, coverage_type, coverage_amount)
SELECT id, coverage_type, COALESCE(coverage_amount, 0)
FROM public.insurance_policies
WHERE coverage_type IS NOT NULL;

-- Mark old columns as deprecated
COMMENT ON COLUMN public.insurance_policies.coverage_type IS
  'DEPRECATED: Use insurance_policy_coverages table. Kept for backward compat.';
COMMENT ON COLUMN public.insurance_policies.coverage_amount IS
  'DEPRECATED: Use insurance_policy_coverages table. Kept for backward compat.';
