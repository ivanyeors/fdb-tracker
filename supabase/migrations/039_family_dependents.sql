-- Migration 039: Family dependency tracking for tax relief auto-derivation
-- Adds gender + spouse linkage to profiles, and a dependents table for children/parents.

-- 1. Gender on profiles (needed for WMCR — working mothers only)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS gender TEXT
    CHECK (gender IN ('male', 'female'));

-- 2. Spouse linkage between two profiles in the same family
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS spouse_profile_id UUID
    REFERENCES profiles(id) ON DELETE SET NULL;

-- 3. Dependents table — lightweight records for children, parents, grandparents
CREATE TABLE IF NOT EXISTS dependents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  birth_year INT NOT NULL CHECK (birth_year >= 1920 AND birth_year <= 2040),
  relationship TEXT NOT NULL CHECK (relationship IN ('child', 'parent', 'grandparent')),
  claimed_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  in_full_time_education BOOLEAN NOT NULL DEFAULT false,
  annual_income NUMERIC(12,2) NOT NULL DEFAULT 0,
  living_with_claimant BOOLEAN NOT NULL DEFAULT true,
  is_handicapped BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dependents_family_id ON dependents(family_id);
CREATE INDEX IF NOT EXISTS idx_dependents_claimed_by ON dependents(claimed_by_profile_id);

ALTER TABLE dependents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dependents_family" ON dependents
  FOR ALL USING (family_id IN (
    SELECT id FROM families
  ));
