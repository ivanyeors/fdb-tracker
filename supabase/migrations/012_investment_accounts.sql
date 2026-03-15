-- 012_investment_accounts.sql
-- Investment account cash balance (uninvested cash in brokerage).
-- Buy deducts from cash; sell adds to cash. Synced with platform metrics.
-- Depends on: 008_add_families (families, profiles)

CREATE TABLE IF NOT EXISTS public.investment_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cash_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_investment_accounts_family_id ON public.investment_accounts(family_id);
CREATE INDEX IF NOT EXISTS idx_investment_accounts_profile_id ON public.investment_accounts(profile_id);

ALTER TABLE public.investment_accounts ENABLE ROW LEVEL SECURITY;
