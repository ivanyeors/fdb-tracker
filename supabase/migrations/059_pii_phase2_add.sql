-- 059_pii_phase2_add.sql
-- PII encryption Phase 2 — direct identifiers + lookup columns.
-- Adds *_enc and *_hash columns alongside existing plaintext columns.
-- Reversible until 064_pii_phase2_drop.sql drops the plaintext after soak.
--
-- Encryption format: "v1:<base64(iv|ct|tag)>" via lib/crypto/cipher.
-- Hash format: hex HMAC-SHA256 via lib/crypto/hash, with input normalization
-- (lowercase + @-strip for usernames; toString+trim for IDs).
--
-- Scope:
--   profiles                 → name, birth_year, telegram_user_id,
--                              telegram_username, telegram_chat_id
--   households               → telegram_chat_id
--   linked_telegram_accounts → telegram_user_id, telegram_username,
--                              telegram_chat_id  (+ unique on hash)
--   signup_codes             → telegram_username, used_by_telegram_user_id
--   families                 → name (encrypt only, no lookups)
--   dependents               → name, birth_year, annual_income (encrypt only)

-- ---- profiles ----
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name_enc TEXT,
  ADD COLUMN IF NOT EXISTS name_hash TEXT,
  ADD COLUMN IF NOT EXISTS birth_year_enc TEXT,
  ADD COLUMN IF NOT EXISTS telegram_user_id_enc TEXT,
  ADD COLUMN IF NOT EXISTS telegram_user_id_hash TEXT,
  ADD COLUMN IF NOT EXISTS telegram_chat_id_enc TEXT,
  ADD COLUMN IF NOT EXISTS telegram_chat_id_hash TEXT,
  ADD COLUMN IF NOT EXISTS telegram_username_enc TEXT,
  ADD COLUMN IF NOT EXISTS telegram_username_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_telegram_user_id_hash
  ON public.profiles(telegram_user_id_hash)
  WHERE telegram_user_id_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_chat_id_hash
  ON public.profiles(telegram_chat_id_hash)
  WHERE telegram_chat_id_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_username_hash
  ON public.profiles(telegram_username_hash)
  WHERE telegram_username_hash IS NOT NULL;
-- Mirrors UNIQUE(family_id, name) from migration 008. Partial — only enforced
-- once name_hash is populated. The plaintext index remains until 064 drops it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_family_id_name_hash
  ON public.profiles(family_id, name_hash)
  WHERE name_hash IS NOT NULL;

-- ---- households ----
ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS telegram_chat_id_enc TEXT,
  ADD COLUMN IF NOT EXISTS telegram_chat_id_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_households_telegram_chat_id_hash
  ON public.households(telegram_chat_id_hash)
  WHERE telegram_chat_id_hash IS NOT NULL;

-- ---- linked_telegram_accounts ----
ALTER TABLE public.linked_telegram_accounts
  ADD COLUMN IF NOT EXISTS telegram_user_id_enc TEXT,
  ADD COLUMN IF NOT EXISTS telegram_user_id_hash TEXT,
  ADD COLUMN IF NOT EXISTS telegram_username_enc TEXT,
  ADD COLUMN IF NOT EXISTS telegram_username_hash TEXT,
  ADD COLUMN IF NOT EXISTS telegram_chat_id_enc TEXT,
  ADD COLUMN IF NOT EXISTS telegram_chat_id_hash TEXT;

-- The dedup unique on (link_api_key_id, telegram_user_id) from migration 016
-- is mirrored on the hash column. Partial — only enforced once hash populated.
-- The plaintext unique remains until 064 drops it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_linked_telegram_accounts_key_user_hash
  ON public.linked_telegram_accounts(link_api_key_id, telegram_user_id_hash)
  WHERE telegram_user_id_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_linked_telegram_accounts_user_id_hash
  ON public.linked_telegram_accounts(telegram_user_id_hash)
  WHERE telegram_user_id_hash IS NOT NULL;

-- ---- signup_codes ----
ALTER TABLE public.signup_codes
  ADD COLUMN IF NOT EXISTS telegram_username_enc TEXT,
  ADD COLUMN IF NOT EXISTS telegram_username_hash TEXT,
  ADD COLUMN IF NOT EXISTS used_by_telegram_user_id_enc TEXT,
  ADD COLUMN IF NOT EXISTS used_by_telegram_user_id_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_signup_codes_telegram_username_hash
  ON public.signup_codes(telegram_username_hash)
  WHERE telegram_username_hash IS NOT NULL;

-- ---- families ----
ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS name_enc TEXT;

-- ---- dependents ----
ALTER TABLE public.dependents
  ADD COLUMN IF NOT EXISTS name_enc TEXT,
  ADD COLUMN IF NOT EXISTS birth_year_enc TEXT,
  ADD COLUMN IF NOT EXISTS annual_income_enc TEXT;

NOTIFY pgrst, 'reload schema';
