-- Multi-tenant support: distinguish owner vs public (Telegram bot) accounts
-- Existing rows default to 'owner', preserving current behavior.

ALTER TABLE households
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'owner'
  CHECK (account_type IN ('owner', 'public'));

-- Fast lookup of profiles by telegram_user_id (used during bot auto-provisioning)
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_user_id
  ON profiles (telegram_user_id)
  WHERE telegram_user_id IS NOT NULL;
