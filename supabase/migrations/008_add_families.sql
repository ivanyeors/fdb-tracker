-- 008_add_families.sql
-- Introduce families entity between households and profiles.
-- Each onboarding creates a distinct family. Profiles belong to families.
-- Depends on: 003, 004, 005, 006, 007

-- ============================================================
-- 1. Create families table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Family 1',
  user_count INT NOT NULL DEFAULT 2 CHECK (user_count >= 1 AND user_count <= 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_families_household_id ON public.families(household_id);

ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Backfill: one family per household
-- ============================================================
INSERT INTO public.families (household_id, name, user_count)
SELECT id, 'Family 1', COALESCE(user_count, 2)
FROM public.households
WHERE NOT EXISTS (
  SELECT 1 FROM public.families f WHERE f.household_id = households.id
);

-- ============================================================
-- 3. Alter profiles: add family_id, backfill, drop household_id
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.families(id) ON DELETE CASCADE;

UPDATE public.profiles p
SET family_id = (SELECT f.id FROM public.families f WHERE f.household_id = p.household_id LIMIT 1)
WHERE p.family_id IS NULL AND p.household_id IS NOT NULL;

-- For any orphaned profiles (household deleted but profile remains), assign to first family of any household
-- This is an edge case; in practice all profiles should have a household
UPDATE public.profiles p
SET family_id = (SELECT id FROM public.families LIMIT 1)
WHERE p.family_id IS NULL AND EXISTS (SELECT 1 FROM public.families);

ALTER TABLE public.profiles ALTER COLUMN family_id SET NOT NULL;

-- Drop old unique constraint and FK
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_household_id_name_key;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_household_id_fkey;
DROP INDEX IF EXISTS public.idx_profiles_household_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS household_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_family_id_name ON public.profiles(family_id, name);
CREATE INDEX IF NOT EXISTS idx_profiles_family_id ON public.profiles(family_id);

-- ============================================================
-- 4. Alter family-scoped tables: add family_id, backfill, drop household_id
-- ============================================================

-- bank_accounts
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.families(id) ON DELETE CASCADE;
UPDATE public.bank_accounts ba
SET family_id = COALESCE(
  (SELECT p.family_id FROM public.profiles p WHERE p.id = ba.profile_id),
  (SELECT f.id FROM public.families f WHERE f.household_id = ba.household_id LIMIT 1)
)
WHERE ba.family_id IS NULL;
ALTER TABLE public.bank_accounts ALTER COLUMN family_id SET NOT NULL;
ALTER TABLE public.bank_accounts DROP CONSTRAINT IF EXISTS bank_accounts_household_id_fkey;
ALTER TABLE public.bank_accounts DROP COLUMN IF EXISTS household_id;
CREATE INDEX IF NOT EXISTS idx_bank_accounts_family_id ON public.bank_accounts(family_id);

-- savings_goals
ALTER TABLE public.savings_goals ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.families(id) ON DELETE CASCADE;
UPDATE public.savings_goals sg
SET family_id = COALESCE(
  (SELECT p.family_id FROM public.profiles p WHERE p.id = sg.profile_id),
  (SELECT f.id FROM public.families f WHERE f.household_id = sg.household_id LIMIT 1)
)
WHERE sg.family_id IS NULL;
ALTER TABLE public.savings_goals ALTER COLUMN family_id SET NOT NULL;
ALTER TABLE public.savings_goals DROP CONSTRAINT IF EXISTS savings_goals_household_id_fkey;
ALTER TABLE public.savings_goals DROP COLUMN IF EXISTS household_id;
CREATE INDEX IF NOT EXISTS idx_savings_goals_family_id ON public.savings_goals(family_id);

-- investments
ALTER TABLE public.investments ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.families(id) ON DELETE CASCADE;
UPDATE public.investments inv
SET family_id = COALESCE(
  (SELECT p.family_id FROM public.profiles p WHERE p.id = inv.profile_id),
  (SELECT f.id FROM public.families f WHERE f.household_id = inv.household_id LIMIT 1)
)
WHERE inv.family_id IS NULL;
ALTER TABLE public.investments ALTER COLUMN family_id SET NOT NULL;
ALTER TABLE public.investments DROP CONSTRAINT IF EXISTS investments_household_id_fkey;
ALTER TABLE public.investments DROP COLUMN IF EXISTS household_id;
CREATE INDEX IF NOT EXISTS idx_investments_family_id ON public.investments(family_id);

-- investment_transactions
ALTER TABLE public.investment_transactions ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.families(id) ON DELETE CASCADE;
UPDATE public.investment_transactions it
SET family_id = COALESCE(
  (SELECT p.family_id FROM public.profiles p WHERE p.id = it.profile_id),
  (SELECT f.id FROM public.families f WHERE f.household_id = it.household_id LIMIT 1)
)
WHERE it.family_id IS NULL;
ALTER TABLE public.investment_transactions ALTER COLUMN family_id SET NOT NULL;
ALTER TABLE public.investment_transactions DROP CONSTRAINT IF EXISTS investment_transactions_household_id_fkey;
ALTER TABLE public.investment_transactions DROP COLUMN IF EXISTS household_id;
CREATE INDEX IF NOT EXISTS idx_investment_transactions_family_id ON public.investment_transactions(family_id);

-- ilp_products
ALTER TABLE public.ilp_products ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.families(id) ON DELETE CASCADE;
UPDATE public.ilp_products ip
SET family_id = COALESCE(
  (SELECT p.family_id FROM public.profiles p WHERE p.id = ip.profile_id),
  (SELECT f.id FROM public.families f WHERE f.household_id = ip.household_id LIMIT 1)
)
WHERE ip.family_id IS NULL;
ALTER TABLE public.ilp_products ALTER COLUMN family_id SET NOT NULL;
ALTER TABLE public.ilp_products DROP CONSTRAINT IF EXISTS ilp_products_household_id_fkey;
ALTER TABLE public.ilp_products DROP COLUMN IF EXISTS household_id;
CREATE INDEX IF NOT EXISTS idx_ilp_products_family_id ON public.ilp_products(family_id);

-- prompt_schedule
ALTER TABLE public.prompt_schedule ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.families(id) ON DELETE CASCADE;
UPDATE public.prompt_schedule ps
SET family_id = (SELECT f.id FROM public.families f WHERE f.household_id = ps.household_id LIMIT 1)
WHERE ps.family_id IS NULL;
ALTER TABLE public.prompt_schedule ALTER COLUMN family_id SET NOT NULL;
ALTER TABLE public.prompt_schedule DROP CONSTRAINT IF EXISTS prompt_schedule_household_id_fkey;
ALTER TABLE public.prompt_schedule DROP COLUMN IF EXISTS household_id;
CREATE INDEX IF NOT EXISTS idx_prompt_schedule_family_id ON public.prompt_schedule(family_id);

-- net_worth_snapshots: change unique from (household_id, profile_id, month) to (family_id, profile_id, month)
ALTER TABLE public.net_worth_snapshots ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.families(id) ON DELETE CASCADE;
UPDATE public.net_worth_snapshots nws
SET family_id = COALESCE(
  (SELECT p.family_id FROM public.profiles p WHERE p.id = nws.profile_id),
  (SELECT f.id FROM public.families f WHERE f.household_id = nws.household_id LIMIT 1)
)
WHERE nws.family_id IS NULL;
ALTER TABLE public.net_worth_snapshots ALTER COLUMN family_id SET NOT NULL;
ALTER TABLE public.net_worth_snapshots DROP CONSTRAINT IF EXISTS net_worth_snapshots_household_id_profile_id_month_key;
ALTER TABLE public.net_worth_snapshots DROP CONSTRAINT IF EXISTS net_worth_snapshots_household_id_fkey;
ALTER TABLE public.net_worth_snapshots DROP COLUMN IF EXISTS household_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_net_worth_snapshots_family_profile_month ON public.net_worth_snapshots(family_id, profile_id, month);
CREATE INDEX IF NOT EXISTS idx_net_worth_snapshots_family_id ON public.net_worth_snapshots(family_id);

-- telegram_commands: keep household_id for audit (which chat ran the command) but add family_id for scoping
-- Actually the plan says to add family_id. For telegram commands, we derive from profile_id or use household's first family
ALTER TABLE public.telegram_commands ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.families(id) ON DELETE SET NULL;
UPDATE public.telegram_commands tc
SET family_id = COALESCE(
  (SELECT p.family_id FROM public.profiles p WHERE p.id = tc.profile_id),
  (SELECT f.id FROM public.families f WHERE f.household_id = tc.household_id LIMIT 1)
)
WHERE tc.family_id IS NULL;
-- Keep household_id on telegram_commands for audit trail (which chat)
CREATE INDEX IF NOT EXISTS idx_telegram_commands_family_id ON public.telegram_commands(family_id);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
