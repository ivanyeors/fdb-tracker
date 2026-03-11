-- Ensure each Telegram chat maps to at most one account (household)
-- Prevents duplicate accounts when getOrCreateAccountForChat is called
CREATE UNIQUE INDEX IF NOT EXISTS idx_households_telegram_chat_id_unique
  ON households (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;
