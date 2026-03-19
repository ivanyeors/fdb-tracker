-- ============================================================
-- investment_snapshots: daily snapshots of total investment value
-- Used for line chart on dashboard and investments detail page
-- ============================================================
CREATE TABLE investment_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  total_value NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, profile_id, date)
);

CREATE INDEX idx_investment_snapshots_family_date ON investment_snapshots(family_id, date);
CREATE INDEX idx_investment_snapshots_profile_date ON investment_snapshots(profile_id, date);

ALTER TABLE investment_snapshots ENABLE ROW LEVEL SECURITY;
