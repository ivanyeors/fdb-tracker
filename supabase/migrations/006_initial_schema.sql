-- 006_initial_schema.sql
-- Finance Dashboard Tracker — Schema (tables not in 003, 004, 005)
-- Depends on: households, profiles (003, 004), income_config (005)

-- ============================================================
-- 1. bank_accounts
-- ============================================================
CREATE TABLE bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  bank_name TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'basic'
    CHECK (account_type IN ('ocbc_360', 'basic', 'savings', 'fixed_deposit')),
  interest_rate_pct NUMERIC(5,4),
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bank_accounts_household_id ON bank_accounts(household_id);
CREATE INDEX idx_bank_accounts_profile_id ON bank_accounts(profile_id);

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. monthly_cashflow
-- ============================================================
CREATE TABLE monthly_cashflow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  inflow NUMERIC(14,2) NOT NULL DEFAULT 0,
  outflow NUMERIC(14,2) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'telegram')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, month)
);

CREATE INDEX idx_monthly_cashflow_profile_id ON monthly_cashflow(profile_id);
CREATE INDEX idx_monthly_cashflow_month ON monthly_cashflow(month);

ALTER TABLE monthly_cashflow ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. bank_balance_snapshots
-- ============================================================
CREATE TABLE bank_balance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  opening_balance NUMERIC(14,2) NOT NULL,
  closing_balance NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, month)
);

CREATE INDEX idx_bank_balance_snapshots_account_id ON bank_balance_snapshots(account_id);
CREATE INDEX idx_bank_balance_snapshots_month ON bank_balance_snapshots(month);

ALTER TABLE bank_balance_snapshots ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. savings_goals
-- ============================================================
CREATE TABLE savings_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  target_amount NUMERIC(14,2) NOT NULL CHECK (target_amount > 0),
  current_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  monthly_auto_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  deadline DATE,
  category TEXT NOT NULL DEFAULT 'custom'
    CHECK (category IN ('dream_home', 'gadget', 'travel', 'wardrobe', 'car', 'custom')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_savings_goals_household_id ON savings_goals(household_id);
CREATE INDEX idx_savings_goals_profile_id ON savings_goals(profile_id);

ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. goal_contributions
-- ============================================================
CREATE TABLE goal_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'telegram', 'auto')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_goal_contributions_goal_id ON goal_contributions(goal_id);

ALTER TABLE goal_contributions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. investments
-- ============================================================
CREATE TABLE investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('stock', 'gold', 'silver', 'ilp', 'etf', 'bond')),
  symbol TEXT NOT NULL,
  units NUMERIC(14,6) NOT NULL DEFAULT 0,
  cost_basis NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_investments_household_id ON investments(household_id);
CREATE INDEX idx_investments_profile_id ON investments(profile_id);
CREATE INDEX idx_investments_symbol ON investments(symbol);

ALTER TABLE investments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. investment_transactions
-- ============================================================
CREATE TABLE investment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id UUID REFERENCES investments(id) ON DELETE SET NULL,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'dividend', 'split')),
  symbol TEXT NOT NULL,
  quantity NUMERIC(14,6) NOT NULL,
  price NUMERIC(14,4) NOT NULL,
  journal_text TEXT,
  screenshot_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_investment_transactions_household_id ON investment_transactions(household_id);
CREATE INDEX idx_investment_transactions_profile_id ON investment_transactions(profile_id);
CREATE INDEX idx_investment_transactions_symbol ON investment_transactions(symbol);
CREATE INDEX idx_investment_transactions_investment_id ON investment_transactions(investment_id);

ALTER TABLE investment_transactions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. ilp_products
-- ============================================================
CREATE TABLE ilp_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  monthly_premium NUMERIC(10,2) NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ilp_products_household_id ON ilp_products(household_id);
CREATE INDEX idx_ilp_products_profile_id ON ilp_products(profile_id);

ALTER TABLE ilp_products ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 9. ilp_entries
-- ============================================================
CREATE TABLE ilp_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES ilp_products(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  fund_value NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, month)
);

CREATE INDEX idx_ilp_entries_product_id ON ilp_entries(product_id);
CREATE INDEX idx_ilp_entries_month ON ilp_entries(month);

ALTER TABLE ilp_entries ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 10. cpf_balances
-- ============================================================
CREATE TABLE cpf_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  oa NUMERIC(14,2) NOT NULL DEFAULT 0,
  sa NUMERIC(14,2) NOT NULL DEFAULT 0,
  ma NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_manual_override BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, month)
);

CREATE INDEX idx_cpf_balances_profile_id ON cpf_balances(profile_id);
CREATE INDEX idx_cpf_balances_month ON cpf_balances(month);

ALTER TABLE cpf_balances ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 11. cpf_housing_usage
-- ============================================================
CREATE TABLE cpf_housing_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL,  -- FK added after loans table is created
  principal_withdrawn NUMERIC(14,2) NOT NULL,
  accrued_interest NUMERIC(14,2) NOT NULL DEFAULT 0,
  withdrawal_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cpf_housing_usage_loan_id ON cpf_housing_usage(loan_id);

ALTER TABLE cpf_housing_usage ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 12. tax_entries
-- ============================================================
CREATE TABLE tax_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  year INT NOT NULL CHECK (year >= 2020 AND year <= 2040),
  calculated_amount NUMERIC(12,2) NOT NULL,
  actual_amount NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, year)
);

CREATE INDEX idx_tax_entries_profile_id ON tax_entries(profile_id);

ALTER TABLE tax_entries ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 13. tax_relief_inputs
-- ============================================================
CREATE TABLE tax_relief_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  year INT NOT NULL CHECK (year >= 2020 AND year <= 2040),
  relief_type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, year, relief_type)
);

CREATE INDEX idx_tax_relief_inputs_profile_id ON tax_relief_inputs(profile_id);
CREATE INDEX idx_tax_relief_inputs_year ON tax_relief_inputs(year);

ALTER TABLE tax_relief_inputs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 14. tax_relief_auto
-- ============================================================
CREATE TABLE tax_relief_auto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  year INT NOT NULL CHECK (year >= 2020 AND year <= 2040),
  relief_type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, year, relief_type)
);

CREATE INDEX idx_tax_relief_auto_profile_id ON tax_relief_auto(profile_id);
CREATE INDEX idx_tax_relief_auto_year ON tax_relief_auto(year);

ALTER TABLE tax_relief_auto ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 15. loans
-- ============================================================
CREATE TABLE loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('housing', 'personal', 'car', 'education')),
  principal NUMERIC(14,2) NOT NULL,
  rate_pct NUMERIC(5,4) NOT NULL,
  tenure_months INT NOT NULL CHECK (tenure_months > 0),
  start_date DATE NOT NULL,
  lender TEXT,
  use_cpf_oa BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_loans_profile_id ON loans(profile_id);

ALTER TABLE loans ENABLE ROW LEVEL SECURITY;

-- Add FK from cpf_housing_usage → loans now that the loans table exists
ALTER TABLE cpf_housing_usage
  ADD CONSTRAINT fk_cpf_housing_usage_loan_id
  FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE;

-- ============================================================
-- 16. loan_repayments
-- ============================================================
CREATE TABLE loan_repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  principal_portion NUMERIC(14,2),
  interest_portion NUMERIC(14,2),
  date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_loan_repayments_loan_id ON loan_repayments(loan_id);
CREATE INDEX idx_loan_repayments_date ON loan_repayments(date);

ALTER TABLE loan_repayments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 17. loan_early_repayments
-- ============================================================
CREATE TABLE loan_early_repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_loan_early_repayments_loan_id ON loan_early_repayments(loan_id);

ALTER TABLE loan_early_repayments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 18. insurance_policies
-- ============================================================
CREATE TABLE insurance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL
    CHECK (type IN ('term_life', 'whole_life', 'integrated_shield', 'critical_illness', 'endowment', 'ilp', 'personal_accident')),
  premium_amount NUMERIC(10,2) NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'yearly'
    CHECK (frequency IN ('monthly', 'yearly')),
  yearly_outflow_date INT CHECK (yearly_outflow_date >= 1 AND yearly_outflow_date <= 12),
  coverage_amount NUMERIC(14,2),
  coverage_type TEXT
    CHECK (coverage_type IN ('death', 'critical_illness', 'hospitalization', 'disability', 'personal_accident')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  deduct_from_outflow BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_insurance_policies_profile_id ON insurance_policies(profile_id);

ALTER TABLE insurance_policies ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 19. insurance_coverage_benchmarks
-- ============================================================
CREATE TABLE insurance_coverage_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  death_coverage_target NUMERIC(14,2) NOT NULL,
  ci_coverage_target NUMERIC(14,2) NOT NULL,
  hospitalization_coverage TEXT NOT NULL DEFAULT 'none',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id)
);

CREATE INDEX idx_insurance_coverage_benchmarks_profile_id ON insurance_coverage_benchmarks(profile_id);

ALTER TABLE insurance_coverage_benchmarks ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 20. insurance_premium_schedule
-- ============================================================
CREATE TABLE insurance_premium_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES insurance_policies(id) ON DELETE CASCADE,
  age_band_min INT NOT NULL CHECK (age_band_min >= 0),
  age_band_max INT NOT NULL CHECK (age_band_max >= 0),
  premium NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (age_band_max >= age_band_min)
);

CREATE INDEX idx_insurance_premium_schedule_policy_id ON insurance_premium_schedule(policy_id);

ALTER TABLE insurance_premium_schedule ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 21. prompt_schedule
-- ============================================================
CREATE TABLE prompt_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  prompt_type TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly', 'yearly')),
  day_of_month INT NOT NULL CHECK (day_of_month >= 1 AND day_of_month <= 31),
  month_of_year INT CHECK (month_of_year >= 1 AND month_of_year <= 12),
  time TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Singapore',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prompt_schedule_household_id ON prompt_schedule(household_id);

ALTER TABLE prompt_schedule ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 22. bank_account_ocbc360_config
-- ============================================================
CREATE TABLE bank_account_ocbc360_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  salary_met BOOLEAN NOT NULL DEFAULT false,
  save_met BOOLEAN NOT NULL DEFAULT false,
  spend_met BOOLEAN NOT NULL DEFAULT false,
  insure_met BOOLEAN NOT NULL DEFAULT false,
  invest_met BOOLEAN NOT NULL DEFAULT false,
  grow_met BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id)
);

CREATE INDEX idx_bank_account_ocbc360_config_account_id ON bank_account_ocbc360_config(account_id);

ALTER TABLE bank_account_ocbc360_config ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 23. telegram_commands
-- ============================================================
CREATE TABLE telegram_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  command TEXT NOT NULL,
  args TEXT,
  raw_message TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_telegram_commands_household_id ON telegram_commands(household_id);
CREATE INDEX idx_telegram_commands_profile_id ON telegram_commands(profile_id);
CREATE INDEX idx_telegram_commands_created_at ON telegram_commands(created_at);

ALTER TABLE telegram_commands ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 24. precious_metals_prices
-- ============================================================
CREATE TABLE precious_metals_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metal_type TEXT NOT NULL CHECK (metal_type IN ('gold', 'silver', 'platinum')),
  buy_price_sgd NUMERIC(12,4) NOT NULL,
  sell_price_sgd NUMERIC(12,4) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'oz',
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (metal_type)
);

ALTER TABLE precious_metals_prices ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 25. net_worth_snapshots
-- ============================================================
CREATE TABLE net_worth_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  month DATE NOT NULL,
  liquid_net_worth NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_net_worth NUMERIC(14,2) NOT NULL DEFAULT 0,
  bank_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  cpf_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  investment_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  loan_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, profile_id, month)
);

CREATE INDEX idx_net_worth_snapshots_household_id ON net_worth_snapshots(household_id);
CREATE INDEX idx_net_worth_snapshots_profile_id ON net_worth_snapshots(profile_id);
CREATE INDEX idx_net_worth_snapshots_month ON net_worth_snapshots(month);

ALTER TABLE net_worth_snapshots ENABLE ROW LEVEL SECURITY;
