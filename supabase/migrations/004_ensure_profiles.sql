-- 004_ensure_profiles.sql
-- Fix: "Could not find the table 'public.profiles' in the schema cache"
-- Run this if 001_initial_schema was never applied or profiles table is missing.
-- Idempotent: safe to run multiple times.

-- profiles (required for dashboard layout, settings, API routes)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  telegram_user_id TEXT,
  birth_year INT NOT NULL CHECK (birth_year >= 1940 AND birth_year <= 2010),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, name)
);

CREATE INDEX IF NOT EXISTS idx_profiles_household_id ON public.profiles(household_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Refresh PostgREST schema cache so the API recognizes the new table
NOTIFY pgrst, 'reload schema';
