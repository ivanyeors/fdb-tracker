-- 062_pii_phase5_add.sql
-- PII encryption Phase 5 — audit log scrubbing. Adds encrypted columns alongside
-- the existing plaintext columns on telegram_commands. Reversible until
-- 067_pii_phase5_drop.sql drops the plaintext columns after soak.
--
-- raw_message can contain free-form user input (financial figures, names,
-- account numbers) when commands fail to parse and we log the unstructured
-- message. args holds the parsed argv string. Both are sensitive once a real
-- writer is introduced; today there is none.
--
-- The 30-day auto-purge cron at app/api/cron/purge/route.ts is the primary
-- defensive measure here — even unencrypted rows are deleted within 30 days
-- of creation, capping the exposure window if a writer is ever added without
-- routing through the encoder.

-- ---- telegram_commands.{raw_message, args} ----
ALTER TABLE public.telegram_commands
  ADD COLUMN IF NOT EXISTS raw_message_enc TEXT,
  ADD COLUMN IF NOT EXISTS args_enc TEXT;

NOTIFY pgrst, 'reload schema';
