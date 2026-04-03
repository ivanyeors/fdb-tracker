-- Structured NOA data for comparison view (auto-populated from PDF import or manual entry)
CREATE TABLE tax_noa_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  year INT NOT NULL CHECK (year BETWEEN 2020 AND 2040),
  employment_income NUMERIC(12,2),
  chargeable_income NUMERIC(12,2),
  total_deductions NUMERIC(12,2),
  donations_deduction NUMERIC(12,2),
  reliefs_total NUMERIC(12,2),
  tax_payable NUMERIC(12,2),
  payment_due_date DATE,
  reliefs_json JSONB DEFAULT '[]',
  bracket_summary_json JSONB DEFAULT '[]',
  is_on_giro BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, year)
);

ALTER TABLE tax_noa_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_noa_data_household" ON tax_noa_data
  FOR ALL USING (
    profile_id IN (
      SELECT p.id FROM profiles p
      JOIN families f ON f.id = p.family_id
      WHERE f.household_id = (current_setting('request.jwt.claims', true)::json->>'householdId')::uuid
    )
  );

-- GIRO instalment schedule (auto-calculated or imported from PDF)
CREATE TABLE tax_giro_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  year INT NOT NULL CHECK (year BETWEEN 2020 AND 2040),
  schedule JSONB NOT NULL DEFAULT '[]',
  total_payable NUMERIC(12,2),
  outstanding_balance NUMERIC(12,2) DEFAULT 0,
  source TEXT DEFAULT 'calculated' CHECK (source IN ('calculated', 'manual', 'pdf_import')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, year)
);

ALTER TABLE tax_giro_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_giro_schedule_household" ON tax_giro_schedule
  FOR ALL USING (
    profile_id IN (
      SELECT p.id FROM profiles p
      JOIN families f ON f.id = p.family_id
      WHERE f.household_id = (current_setting('request.jwt.claims', true)::json->>'householdId')::uuid
    )
  );
