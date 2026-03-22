-- Add profile_id to cpf_housing_usage so CPF OA deductions can be tracked
-- per-profile for split HDB loans.
ALTER TABLE public.cpf_housing_usage
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cpf_housing_usage_profile_id
  ON cpf_housing_usage(profile_id);
