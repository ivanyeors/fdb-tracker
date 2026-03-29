-- Add profile_id to ilp_fund_groups to allow assigning groups to individual users
ALTER TABLE ilp_fund_groups ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX idx_ilp_fund_groups_profile_id ON ilp_fund_groups(profile_id);
