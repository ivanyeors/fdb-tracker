-- 003_ensure_households.sql
-- Fix for /otp error: "Could not find the table 'public.households' in the schema cache"
-- Run this if 006_initial_schema was never applied or households table is missing.
-- Idempotent: safe to run multiple times.

-- 1. households (required for Telegram /otp and /start)
CREATE TABLE IF NOT EXISTS public.households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_count INT NOT NULL DEFAULT 2 CHECK (user_count >= 1 AND user_count <= 6),
  telegram_chat_id TEXT,
  telegram_bot_token TEXT,
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

-- 2. otp_tokens (required for /otp login flow)
CREATE TABLE IF NOT EXISTS public.otp_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_tokens_household_id ON public.otp_tokens(household_id);
CREATE INDEX IF NOT EXISTS idx_otp_tokens_expires_at ON public.otp_tokens(expires_at);

ALTER TABLE public.otp_tokens ENABLE ROW LEVEL SECURITY;

-- Refresh PostgREST schema cache so the API recognizes the new tables
NOTIFY pgrst, 'reload schema';
