-- Add account_number to bank_accounts for statement matching
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS account_number TEXT;
CREATE INDEX IF NOT EXISTS idx_bank_accounts_number ON bank_accounts(account_number);
