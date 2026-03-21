-- Group-level premium budget and monthly vs one-time; per-product payment mode for cashflow.
ALTER TABLE public.ilp_fund_groups
  ADD COLUMN IF NOT EXISTS group_premium_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS premium_payment_mode TEXT NOT NULL DEFAULT 'monthly';

ALTER TABLE public.ilp_fund_groups
  DROP CONSTRAINT IF EXISTS ilp_fund_groups_premium_payment_mode_check;

ALTER TABLE public.ilp_fund_groups
  ADD CONSTRAINT ilp_fund_groups_premium_payment_mode_check
  CHECK (premium_payment_mode IN ('monthly', 'one_time'));

COMMENT ON COLUMN public.ilp_fund_groups.group_premium_amount IS
  'Total premium amount for the group (SGD). Split across members by group_allocation_pct when mode is monthly.';
COMMENT ON COLUMN public.ilp_fund_groups.premium_payment_mode IS
  'monthly: group_premium_amount is recurring; one_time: lump sum, products store 0 monthly_premium for outflow.';

ALTER TABLE public.ilp_products
  ADD COLUMN IF NOT EXISTS premium_payment_mode TEXT NOT NULL DEFAULT 'monthly';

ALTER TABLE public.ilp_products
  DROP CONSTRAINT IF EXISTS ilp_products_premium_payment_mode_check;

ALTER TABLE public.ilp_products
  ADD CONSTRAINT ilp_products_premium_payment_mode_check
  CHECK (premium_payment_mode IN ('monthly', 'one_time'));

COMMENT ON COLUMN public.ilp_products.premium_payment_mode IS
  'monthly: monthly_premium counts toward recurring outflow; one_time: excluded from monthly ILP outflow.';
