-- 056_investment_account_names.sql
-- Support multiple named investment accounts per profile (e.g. IBKR, Tiger, OCBC Gold).
-- Link holdings and transactions to specific accounts for per-account cash tracking.
-- Depends on: 012_investment_accounts, 022_investment_accounts_partial_unique

-- 1. Add account_name to distinguish platforms
ALTER TABLE public.investment_accounts
  ADD COLUMN IF NOT EXISTS account_name TEXT NOT NULL DEFAULT 'Default';

-- 2. Link holdings to specific accounts
ALTER TABLE public.investments
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.investment_accounts(id) ON DELETE SET NULL;

-- 3. Link transactions to specific accounts
ALTER TABLE public.investment_transactions
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.investment_accounts(id) ON DELETE SET NULL;

-- 4. Replace old uniqueness constraints (one account per family+profile)
--    with new ones (one account_name per family+profile)
DROP INDEX IF EXISTS investment_accounts_family_one_shared;
DROP INDEX IF EXISTS investment_accounts_family_profile_unique;

CREATE UNIQUE INDEX investment_accounts_family_profile_name_unique
  ON public.investment_accounts (family_id, profile_id, account_name)
  WHERE profile_id IS NOT NULL;

CREATE UNIQUE INDEX investment_accounts_family_shared_name_unique
  ON public.investment_accounts (family_id, account_name)
  WHERE profile_id IS NULL;

-- 5. Backfill account_id on existing holdings to the Default account
UPDATE public.investments inv
SET account_id = (
  SELECT ia.id FROM public.investment_accounts ia
  WHERE ia.family_id = inv.family_id
    AND (
      (ia.profile_id = inv.profile_id)
      OR (ia.profile_id IS NULL AND inv.profile_id IS NULL)
    )
  LIMIT 1
)
WHERE inv.account_id IS NULL;

-- 6. Backfill account_id on existing transactions
UPDATE public.investment_transactions txn
SET account_id = (
  SELECT ia.id FROM public.investment_accounts ia
  WHERE ia.family_id = txn.family_id
    AND (
      (ia.profile_id = txn.profile_id)
      OR (ia.profile_id IS NULL AND txn.profile_id IS NULL)
    )
  LIMIT 1
)
WHERE txn.account_id IS NULL;

-- 7. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_investments_account_id ON public.investments(account_id);
CREATE INDEX IF NOT EXISTS idx_investment_transactions_account_id ON public.investment_transactions(account_id);
