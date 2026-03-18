-- 016_link_api_keys.sql
-- API keys for linking Telegram to platform. Create keys in Setup, paste in /auth or /link.
-- Depends on: 003 (households)

-- ============================================================
-- 1. link_api_keys
-- ============================================================
CREATE TABLE IF NOT EXISTS public.link_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  api_key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT,
  max_members INT NOT NULL DEFAULT 10 CHECK (max_members >= 1 AND max_members <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_link_api_keys_household_prefix
  ON public.link_api_keys(household_id, key_prefix);
CREATE INDEX IF NOT EXISTS idx_link_api_keys_hash
  ON public.link_api_keys(api_key_hash);

ALTER TABLE public.link_api_keys ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. linked_telegram_accounts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.linked_telegram_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_api_key_id UUID NOT NULL REFERENCES public.link_api_keys(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  telegram_user_id TEXT NOT NULL,
  telegram_username TEXT,
  telegram_chat_id TEXT NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_linked_telegram_accounts_key_user
  ON public.linked_telegram_accounts(link_api_key_id, telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_linked_telegram_accounts_household
  ON public.linked_telegram_accounts(household_id);
CREATE INDEX IF NOT EXISTS idx_linked_telegram_accounts_user_id
  ON public.linked_telegram_accounts(telegram_user_id);

ALTER TABLE public.linked_telegram_accounts ENABLE ROW LEVEL SECURITY;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
