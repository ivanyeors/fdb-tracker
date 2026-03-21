-- Per-product weight within an ILP fund group (must sum to 100% for all members of a group).
ALTER TABLE public.ilp_products
  ADD COLUMN IF NOT EXISTS group_allocation_pct NUMERIC(5, 2);

COMMENT ON COLUMN public.ilp_products.group_allocation_pct IS
  'Share of the group portfolio (0–100). Required when ilp_fund_group_id is set; NULL when ungrouped.';
