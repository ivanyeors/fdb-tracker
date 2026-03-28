-- Migration 036: Computed bank balances from cashflow
-- Adds primary_bank_account_id to profiles, deduction_bank_account_id to
-- insurance/loans/ILP, linked entity tracking on GIRO rules,
-- and outflow categories infrastructure.

-- 1. Primary bank account for each profile (where inflow lands)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS primary_bank_account_id UUID
    REFERENCES bank_accounts(id) ON DELETE SET NULL;

-- 2. Reconciliation flag on snapshots (existing snapshots become reconciliation points)
ALTER TABLE bank_balance_snapshots
  ADD COLUMN IF NOT EXISTS is_reconciliation BOOLEAN NOT NULL DEFAULT true;

-- 3. Deduction account for fixed costs (defaults to primary when null)
ALTER TABLE insurance_policies
  ADD COLUMN IF NOT EXISTS deduction_bank_account_id UUID
    REFERENCES bank_accounts(id) ON DELETE SET NULL;

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS deduction_bank_account_id UUID
    REFERENCES bank_accounts(id) ON DELETE SET NULL;

ALTER TABLE ilp_products
  ADD COLUMN IF NOT EXISTS deduction_bank_account_id UUID
    REFERENCES bank_accounts(id) ON DELETE SET NULL;

-- 4. Link GIRO rules to the entity they serve (for bidirectional sync + deduplication)
ALTER TABLE giro_rules
  ADD COLUMN IF NOT EXISTS linked_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS linked_entity_id UUID;

-- 5. Outflow categories (future use — food, travel, transport, etc.)
CREATE TABLE IF NOT EXISTS outflow_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  icon TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE outflow_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outflow_categories_household" ON outflow_categories
  FOR ALL USING (household_id IN (
    SELECT id FROM households
  ));

-- 6. Outflow entries — multiple per profile per month (one per category)
CREATE TABLE IF NOT EXISTS outflow_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id),
  month TEXT NOT NULL,
  category_id UUID REFERENCES outflow_categories(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE outflow_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outflow_entries_profile" ON outflow_entries
  FOR ALL USING (profile_id IN (
    SELECT id FROM profiles
  ));

CREATE UNIQUE INDEX IF NOT EXISTS outflow_entries_unique
  ON outflow_entries(profile_id, month, category_id);

-- 7. Backfill: set primary_bank_account_id to the first bank account per profile
UPDATE profiles p
SET primary_bank_account_id = (
  SELECT ba.id
  FROM bank_accounts ba
  WHERE ba.profile_id = p.id
  ORDER BY ba.created_at ASC
  LIMIT 1
)
WHERE p.primary_bank_account_id IS NULL;
