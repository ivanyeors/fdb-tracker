-- 017_add_telegram_username_to_profiles.sql
-- Add telegram_username to profiles for OTP-stage lookup when household is unresolved.
-- Depends on: 015 (telegram_profile_link)

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_username TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_telegram_username
  ON public.profiles(telegram_username)
  WHERE telegram_username IS NOT NULL;
