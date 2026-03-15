-- 011_giro_rules.sql
-- GIRO rules for recurring monthly transfers from a bank account to a destination.
-- Destinations: outflow, investments, cpf_investments, srs, bank_account.
-- Depends on: bank_accounts, families, profiles

CREATE TABLE public.giro_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  source_bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  destination_type TEXT NOT NULL CHECK (destination_type IN (
    'outflow', 'investments', 'cpf_investments', 'srs', 'bank_account'
  )),
  destination_bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_giro_rules_family_id ON public.giro_rules(family_id);
CREATE INDEX idx_giro_rules_profile_id ON public.giro_rules(profile_id);
CREATE INDEX idx_giro_rules_source_bank_account_id ON public.giro_rules(source_bank_account_id);

ALTER TABLE public.giro_rules ENABLE ROW LEVEL SECURITY;
