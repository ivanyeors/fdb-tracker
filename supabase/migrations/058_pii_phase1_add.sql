-- 058_pii_phase1_add.sql
-- PII encryption Phase 1 — credentials. Adds encrypted columns alongside plaintext.
-- Reversible until 063_pii_phase1_drop.sql drops the plaintext columns after soak.
--
-- Encrypted columns store ciphertext from lib/crypto with format "v1:<base64(iv|ct|tag)>".
-- Hash columns store HMAC-SHA256 hex from lib/crypto/hash for deterministic lookup.
--
-- Scope of this migration:
--   - households.telegram_bot_token   → households.telegram_bot_token_enc
--   - profiles.telegram_link_token    → profiles.telegram_link_token_enc + _hash
--   - telegram_sessions.session_data  → telegram_sessions.session_data_enc
--
-- otp_tokens.ip_address is intentionally NOT encrypted here — no code path
-- writes to that column today. If IP logging is added later, that PR adds
-- encryption in the same change.

-- ---- households.telegram_bot_token ----
ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS telegram_bot_token_enc TEXT;

-- ---- profiles.telegram_link_token (lookup target in link-api-scene) ----
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_link_token_enc TEXT,
  ADD COLUMN IF NOT EXISTS telegram_link_token_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_telegram_link_token_hash
  ON public.profiles(telegram_link_token_hash)
  WHERE telegram_link_token_hash IS NOT NULL;

-- ---- telegram_sessions.session_data (whole JSONB blob) ----
ALTER TABLE public.telegram_sessions
  ADD COLUMN IF NOT EXISTS session_data_enc TEXT;

NOTIFY pgrst, 'reload schema';
