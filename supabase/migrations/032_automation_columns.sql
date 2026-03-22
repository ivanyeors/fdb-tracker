-- Add is_auto_generated flag to monthly_cashflow
ALTER TABLE monthly_cashflow
  ADD COLUMN IF NOT EXISTS is_auto_generated BOOLEAN NOT NULL DEFAULT false;

-- Add is_auto_generated flag to loan_repayments
ALTER TABLE loan_repayments
  ADD COLUMN IF NOT EXISTS is_auto_generated BOOLEAN NOT NULL DEFAULT false;

-- Add linked insurance/investment to OCBC 360 config
ALTER TABLE bank_account_ocbc360_config
  ADD COLUMN IF NOT EXISTS linked_insurance_policy_id UUID REFERENCES insurance_policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_investment_id UUID REFERENCES investments(id) ON DELETE SET NULL;

-- Add linked_bank_account_id to savings_goals for auto-sync current_amount
ALTER TABLE savings_goals
  ADD COLUMN IF NOT EXISTS linked_bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL;

-- Add marital_status and num_dependents to profiles for insurance life-stage
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS marital_status TEXT CHECK (marital_status IN ('single', 'married', 'divorced', 'widowed')),
  ADD COLUMN IF NOT EXISTS num_dependents INTEGER NOT NULL DEFAULT 0 CHECK (num_dependents >= 0 AND num_dependents <= 20);

-- Add target_allocation_pct to investments for rebalancing
ALTER TABLE investments
  ADD COLUMN IF NOT EXISTS target_allocation_pct NUMERIC(5,2) CHECK (target_allocation_pct >= 0 AND target_allocation_pct <= 100);
