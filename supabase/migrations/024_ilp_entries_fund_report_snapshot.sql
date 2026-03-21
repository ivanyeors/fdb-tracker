-- Optional JSON snapshot from Tokio/Morningstar fund report MHTML import (Option A schema).
-- Version 024: was 022_ilp_* but 022 is already used by investment_accounts_partial_unique.
ALTER TABLE public.ilp_entries
  ADD COLUMN IF NOT EXISTS fund_report_snapshot jsonb;

COMMENT ON COLUMN public.ilp_entries.fund_report_snapshot IS
  'Parsed fund report metadata (allocation, header, performance tables) from MHTML import; versioned object from lib/ilp-import/types.';
