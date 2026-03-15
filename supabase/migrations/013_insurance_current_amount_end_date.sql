-- Add current_amount and end_date to insurance_policies for ILP, endowment, whole life
ALTER TABLE insurance_policies
  ADD COLUMN IF NOT EXISTS current_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS end_date DATE;
