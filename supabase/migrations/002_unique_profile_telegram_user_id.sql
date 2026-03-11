CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_telegram_user_id_unique
ON profiles(telegram_user_id)
WHERE telegram_user_id IS NOT NULL;
