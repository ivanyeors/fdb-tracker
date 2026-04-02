-- 1. bank_transactions — stores individual parsed transactions from bank/CC statements
CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
  month TEXT NOT NULL,
  txn_date DATE NOT NULL,
  value_date DATE,
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  balance NUMERIC(14,2),
  txn_type TEXT NOT NULL CHECK (txn_type IN ('debit', 'credit')),
  statement_type TEXT NOT NULL CHECK (statement_type IN ('bank', 'cc')),
  category_id UUID REFERENCES outflow_categories(id) ON DELETE SET NULL,
  foreign_currency TEXT,
  exclude_from_spending BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'pdf_import' CHECK (source IN ('pdf_import', 'manual', 'telegram')),
  raw_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, month, txn_date, description, amount, statement_type)
);

CREATE INDEX IF NOT EXISTS idx_bank_txn_profile ON bank_transactions(profile_id);
CREATE INDEX IF NOT EXISTS idx_bank_txn_family ON bank_transactions(family_id);
CREATE INDEX IF NOT EXISTS idx_bank_txn_account ON bank_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_bank_txn_month ON bank_transactions(month);
CREATE INDEX IF NOT EXISTS idx_bank_txn_category ON bank_transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_bank_txn_date ON bank_transactions(txn_date);

ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'bank_transactions_profile') THEN
    CREATE POLICY "bank_transactions_profile" ON bank_transactions
      FOR ALL USING (profile_id IN (SELECT id FROM profiles));
  END IF;
END $$;

-- 2. category_rules — keyword → category mapping (system defaults + user-learned)
CREATE TABLE IF NOT EXISTS category_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  match_pattern TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES outflow_categories(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('system', 'user')),
  priority INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(household_id, match_pattern)
);

CREATE INDEX IF NOT EXISTS idx_category_rules_household ON category_rules(household_id);

ALTER TABLE category_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'category_rules_household') THEN
    CREATE POLICY "category_rules_household" ON category_rules
      FOR ALL USING (household_id IN (SELECT id FROM households));
  END IF;
END $$;

-- 3. Seed system categories into outflow_categories for all existing households
-- Uses ON CONFLICT to avoid duplicates if categories already exist
INSERT INTO outflow_categories (household_id, name, icon, sort_order, is_system)
SELECT h.id, c.name, c.icon, c.sort_order, true
FROM households h
CROSS JOIN (VALUES
  ('Food & Dining',           'utensils',          1),
  ('Transport',               'car',               2),
  ('Housing',                 'home',              3),
  ('Bills & Utilities',       'receipt',           4),
  ('Shopping',                'shopping-bag',      5),
  ('Software & Subscriptions','laptop',            6),
  ('Insurance',               'shield',            7),
  ('Investments & Savings',   'trending-up',       8),
  ('Transfers',               'arrow-right-left',  9),
  ('Income',                  'wallet',           10),
  ('Fees & Charges',          'badge-percent',    11),
  ('CC Payment',              'credit-card',      12),
  ('Others',                  'circle-dot',       99)
) AS c(name, icon, sort_order)
ON CONFLICT DO NOTHING;

-- 4. Seed system category rules for each household
-- These are the default keyword→category mappings used by auto-categorization
DO $$
DECLARE
  hh RECORD;
  cat_id UUID;
BEGIN
  FOR hh IN SELECT id FROM households LOOP

    -- Food & Dining
    SELECT id INTO cat_id FROM outflow_categories WHERE household_id = hh.id AND name = 'Food & Dining' AND is_system = true LIMIT 1;
    IF cat_id IS NOT NULL THEN
      INSERT INTO category_rules (household_id, match_pattern, category_id, source, priority) VALUES
        (hh.id, 'GRAB FOOD', cat_id, 'system', 0),
        (hh.id, 'GRABFOOD', cat_id, 'system', 0),
        (hh.id, 'FOODPANDA', cat_id, 'system', 0),
        (hh.id, 'DELIVEROO', cat_id, 'system', 0),
        (hh.id, 'NTUC', cat_id, 'system', 0),
        (hh.id, 'FAIRPRICE', cat_id, 'system', 0),
        (hh.id, 'COLD STORAGE', cat_id, 'system', 0),
        (hh.id, 'SHENG SIONG', cat_id, 'system', 0),
        (hh.id, 'DONER KEBAB', cat_id, 'system', 0),
        (hh.id, 'GYG', cat_id, 'system', 0),
        (hh.id, 'YA KUN', cat_id, 'system', 0),
        (hh.id, 'BAKERY', cat_id, 'system', 0),
        (hh.id, 'SUPERGREEN', cat_id, 'system', 0),
        (hh.id, 'VELO PANCAKES', cat_id, 'system', 0),
        (hh.id, 'EAT 3 BOWLS', cat_id, 'system', 0),
        (hh.id, 'CAKEBAR', cat_id, 'system', 0),
        (hh.id, 'ELEPHANT GROUNDS', cat_id, 'system', 0),
        (hh.id, 'COLUMBUS-COFFEE', cat_id, 'system', 0),
        (hh.id, 'SMASH BY B', cat_id, 'system', 0),
        (hh.id, 'UMAI', cat_id, 'system', 0),
        (hh.id, 'HVALA', cat_id, 'system', 0),
        (hh.id, 'DESSERT BOWL', cat_id, 'system', 0),
        (hh.id, 'OLD CHANG KEE', cat_id, 'system', 0),
        (hh.id, 'GOKOKU', cat_id, 'system', 0),
        (hh.id, 'BREADTALK', cat_id, 'system', 0),
        (hh.id, 'OMNIVORE', cat_id, 'system', 0),
        (hh.id, 'GOLDEN WOK', cat_id, 'system', 0),
        (hh.id, 'SIONG HUAT', cat_id, 'system', 0),
        (hh.id, 'SWEE HENG', cat_id, 'system', 0),
        (hh.id, 'DELIBOWL', cat_id, 'system', 0),
        (hh.id, 'TOAST BOX', cat_id, 'system', 0),
        (hh.id, 'BIRDS OF PARADISE', cat_id, 'system', 0),
        (hh.id, 'URBAN MIX', cat_id, 'system', 0),
        (hh.id, 'KOBASHI', cat_id, 'system', 0),
        (hh.id, 'BEGONIA', cat_id, 'system', 0),
        (hh.id, 'MUNCHI', cat_id, 'system', 0)
      ON CONFLICT (household_id, match_pattern) DO NOTHING;
    END IF;

    -- Transport
    SELECT id INTO cat_id FROM outflow_categories WHERE household_id = hh.id AND name = 'Transport' AND is_system = true LIMIT 1;
    IF cat_id IS NOT NULL THEN
      INSERT INTO category_rules (household_id, match_pattern, category_id, source, priority) VALUES
        (hh.id, 'GOJEK', cat_id, 'system', 0),
        (hh.id, 'GOPAY-GOJEK', cat_id, 'system', 0),
        (hh.id, 'TADA', cat_id, 'system', 0),
        (hh.id, 'TADA MOBILITY', cat_id, 'system', 0),
        (hh.id, 'COMFORT', cat_id, 'system', 0),
        (hh.id, 'EZ-LINK', cat_id, 'system', 0),
        (hh.id, 'SIMPLYGO', cat_id, 'system', 0),
        (hh.id, 'LTA', cat_id, 'system', 0),
        (hh.id, 'BUS/MRT', cat_id, 'system', 0)
      ON CONFLICT (household_id, match_pattern) DO NOTHING;
    END IF;

    -- Housing
    SELECT id INTO cat_id FROM outflow_categories WHERE household_id = hh.id AND name = 'Housing' AND is_system = true LIMIT 1;
    IF cat_id IS NOT NULL THEN
      INSERT INTO category_rules (household_id, match_pattern, category_id, source, priority) VALUES
        (hh.id, 'HDB', cat_id, 'system', 0),
        (hh.id, 'CONDO', cat_id, 'system', 0),
        (hh.id, 'TOWN COUNCIL', cat_id, 'system', 0)
      ON CONFLICT (household_id, match_pattern) DO NOTHING;
    END IF;

    -- Bills & Utilities
    SELECT id INTO cat_id FROM outflow_categories WHERE household_id = hh.id AND name = 'Bills & Utilities' AND is_system = true LIMIT 1;
    IF cat_id IS NOT NULL THEN
      INSERT INTO category_rules (household_id, match_pattern, category_id, source, priority) VALUES
        (hh.id, 'SINGTEL', cat_id, 'system', 0),
        (hh.id, 'STARHUB', cat_id, 'system', 0),
        (hh.id, 'M1', cat_id, 'system', 0),
        (hh.id, 'SP SERVICES', cat_id, 'system', 0),
        (hh.id, 'PUB', cat_id, 'system', 0),
        (hh.id, 'SERAYA ENERGY', cat_id, 'system', 0),
        (hh.id, 'GENECO', cat_id, 'system', 0),
        (hh.id, 'KEPPEL ELECTRIC', cat_id, 'system', 0),
        (hh.id, 'MYREPUBLIC', cat_id, 'system', 0)
      ON CONFLICT (household_id, match_pattern) DO NOTHING;
    END IF;

    -- Shopping
    SELECT id INTO cat_id FROM outflow_categories WHERE household_id = hh.id AND name = 'Shopping' AND is_system = true LIMIT 1;
    IF cat_id IS NOT NULL THEN
      INSERT INTO category_rules (household_id, match_pattern, category_id, source, priority) VALUES
        (hh.id, 'TAKASHIMAYA', cat_id, 'system', 0),
        (hh.id, 'SHOPEE', cat_id, 'system', 0),
        (hh.id, 'LAZADA', cat_id, 'system', 0),
        (hh.id, 'AMAZON', cat_id, 'system', 0),
        (hh.id, 'UNIQLO', cat_id, 'system', 0),
        (hh.id, 'MUJI', cat_id, 'system', 0),
        (hh.id, 'DECATHLON', cat_id, 'system', 0),
        (hh.id, 'WATSONS', cat_id, 'system', 0),
        (hh.id, 'TAOBAO', cat_id, 'system', 0),
        (hh.id, 'DON DON DONKI', cat_id, 'system', 0),
        (hh.id, 'ANTHDL', cat_id, 'system', 0)
      ON CONFLICT (household_id, match_pattern) DO NOTHING;
    END IF;

    -- Software & Subscriptions
    SELECT id INTO cat_id FROM outflow_categories WHERE household_id = hh.id AND name = 'Software & Subscriptions' AND is_system = true LIMIT 1;
    IF cat_id IS NOT NULL THEN
      INSERT INTO category_rules (household_id, match_pattern, category_id, source, priority) VALUES
        (hh.id, 'CURSOR', cat_id, 'system', 0),
        (hh.id, 'GITHUB', cat_id, 'system', 0),
        (hh.id, 'NETFLIX', cat_id, 'system', 0),
        (hh.id, 'SPOTIFY', cat_id, 'system', 0),
        (hh.id, 'APPLE.COM', cat_id, 'system', 0),
        (hh.id, 'GOOGLE', cat_id, 'system', 0),
        (hh.id, 'CHATGPT', cat_id, 'system', 0),
        (hh.id, 'OPENAI', cat_id, 'system', 0)
      ON CONFLICT (household_id, match_pattern) DO NOTHING;
    END IF;

    -- Insurance
    SELECT id INTO cat_id FROM outflow_categories WHERE household_id = hh.id AND name = 'Insurance' AND is_system = true LIMIT 1;
    IF cat_id IS NOT NULL THEN
      INSERT INTO category_rules (household_id, match_pattern, category_id, source, priority) VALUES
        (hh.id, 'INSU', cat_id, 'system', 0),
        (hh.id, 'TMLS', cat_id, 'system', 0),
        (hh.id, 'NTUC INCOME', cat_id, 'system', 0),
        (hh.id, 'AIA', cat_id, 'system', 0),
        (hh.id, 'PRUDENTIAL', cat_id, 'system', 0),
        (hh.id, 'GREAT EASTERN', cat_id, 'system', 0),
        (hh.id, 'SINGLIFE', cat_id, 'system', 0),
        (hh.id, 'MANULIFE', cat_id, 'system', 0)
      ON CONFLICT (household_id, match_pattern) DO NOTHING;
    END IF;

    -- Investments & Savings
    SELECT id INTO cat_id FROM outflow_categories WHERE household_id = hh.id AND name = 'Investments & Savings' AND is_system = true LIMIT 1;
    IF cat_id IS NOT NULL THEN
      INSERT INTO category_rules (household_id, match_pattern, category_id, source, priority) VALUES
        (hh.id, 'IBKR', cat_id, 'system', 0),
        (hh.id, 'INTERACTIVE BROKERS', cat_id, 'system', 0),
        (hh.id, 'TIGER', cat_id, 'system', 0),
        (hh.id, 'SYFE', cat_id, 'system', 0),
        (hh.id, 'ENDOWUS', cat_id, 'system', 0),
        (hh.id, 'STASHAWAY', cat_id, 'system', 0)
      ON CONFLICT (household_id, match_pattern) DO NOTHING;
    END IF;

    -- Income
    SELECT id INTO cat_id FROM outflow_categories WHERE household_id = hh.id AND name = 'Income' AND is_system = true LIMIT 1;
    IF cat_id IS NOT NULL THEN
      INSERT INTO category_rules (household_id, match_pattern, category_id, source, priority) VALUES
        (hh.id, 'SALARY', cat_id, 'system', 0),
        (hh.id, 'BONUS INTEREST', cat_id, 'system', 0),
        (hh.id, 'INTEREST CREDIT', cat_id, 'system', 0),
        (hh.id, 'CASH REBATE', cat_id, 'system', 0)
      ON CONFLICT (household_id, match_pattern) DO NOTHING;
    END IF;

    -- Fees & Charges
    SELECT id INTO cat_id FROM outflow_categories WHERE household_id = hh.id AND name = 'Fees & Charges' AND is_system = true LIMIT 1;
    IF cat_id IS NOT NULL THEN
      INSERT INTO category_rules (household_id, match_pattern, category_id, source, priority) VALUES
        (hh.id, 'CCY CONVERSION FEE', cat_id, 'system', 0),
        (hh.id, 'ANNUAL FEE', cat_id, 'system', 0),
        (hh.id, 'LATE PAYMENT', cat_id, 'system', 0),
        (hh.id, 'SERVICE CHARGE', cat_id, 'system', 0),
        (hh.id, 'SER CHARGE', cat_id, 'system', 0)
      ON CONFLICT (household_id, match_pattern) DO NOTHING;
    END IF;

    -- CC Payment
    SELECT id INTO cat_id FROM outflow_categories WHERE household_id = hh.id AND name = 'CC Payment' AND is_system = true LIMIT 1;
    IF cat_id IS NOT NULL THEN
      INSERT INTO category_rules (household_id, match_pattern, category_id, source, priority) VALUES
        (hh.id, 'PAYMENT BY INTERNET', cat_id, 'system', 0),
        (hh.id, 'PAYMENT BY GIRO', cat_id, 'system', 0),
        (hh.id, 'FAST INCOMING PAYMENT', cat_id, 'system', 0),
        (hh.id, 'Credit Card', cat_id, 'system', 0)
      ON CONFLICT (household_id, match_pattern) DO NOTHING;
    END IF;

  END LOOP;
END $$;
