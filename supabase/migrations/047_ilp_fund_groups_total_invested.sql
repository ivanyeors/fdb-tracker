-- Add total_invested column to ilp_fund_groups
-- Stores the user-supplied total premiums paid for the group.
-- Split across member entries by allocation_pct when updated.

ALTER TABLE public.ilp_fund_groups
  ADD COLUMN IF NOT EXISTS total_invested NUMERIC(14, 2);
