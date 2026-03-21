-- Optional reported OCBC eligible credit card spend (for Spend bonus progress).
ALTER TABLE bank_account_ocbc360_config
  ADD COLUMN IF NOT EXISTS ocbc_card_spend_monthly NUMERIC(14,2);

COMMENT ON COLUMN bank_account_ocbc360_config.ocbc_card_spend_monthly IS
  'Last reported eligible OCBC card spend for the month (SGD). Used for Spend category progress; optional.';
