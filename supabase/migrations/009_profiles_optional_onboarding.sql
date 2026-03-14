-- 009_profiles_optional_onboarding.sql
-- Add optional_onboarding_completed_at to profiles for tracking optional setup completion.
-- Depends on: 008

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS optional_onboarding_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_optional_onboarding
  ON public.profiles(optional_onboarding_completed_at)
  WHERE optional_onboarding_completed_at IS NULL;

NOTIFY pgrst, 'reload schema';
