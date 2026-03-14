-- 005_ensure_income_config.sql
-- Fix: "Could not find a relationship between 'profiles' and 'income_config' in the schema cache"
-- Run this if 006_initial_schema was never applied or income_config table is missing.
-- Idempotent: safe to run multiple times.

-- income_config (required for settings/users page embedded select)
CREATE TABLE IF NOT EXISTS public.income_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  annual_salary NUMERIC(12,2) NOT NULL,
  bonus_estimate NUMERIC(12,2) NOT NULL DEFAULT 0,
  pay_frequency TEXT NOT NULL DEFAULT 'monthly'
    CHECK (pay_frequency IN ('monthly', 'bi-monthly', 'weekly')),
  employee_cpf_rate NUMERIC(5,4),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id)
);

CREATE INDEX IF NOT EXISTS idx_income_config_profile_id ON public.income_config(profile_id);

ALTER TABLE public.income_config ENABLE ROW LEVEL SECURITY;

-- Refresh PostgREST schema cache so the API recognizes the table and relationship
NOTIFY pgrst, 'reload schema';
