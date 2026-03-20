-- Cumulative premiums paid through each snapshot month (optional; for accurate ILP return vs estimate).
ALTER TABLE public.ilp_entries
  ADD COLUMN IF NOT EXISTS premiums_paid NUMERIC(14, 2);

COMMENT ON COLUMN public.ilp_entries.premiums_paid IS
  'Total premiums paid through this month (statement figure); nullable—when null, app estimates from monthly premium.';
