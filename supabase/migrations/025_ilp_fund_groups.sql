-- Optional named groups to cluster multiple ILP products (e.g. one insurer portfolio).
CREATE TABLE IF NOT EXISTS public.ilp_fund_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ilp_fund_groups_family_id ON public.ilp_fund_groups(family_id);

ALTER TABLE public.ilp_fund_groups ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ilp_products
  ADD COLUMN IF NOT EXISTS ilp_fund_group_id UUID REFERENCES public.ilp_fund_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ilp_products_ilp_fund_group_id ON public.ilp_products(ilp_fund_group_id);

COMMENT ON TABLE public.ilp_fund_groups IS 'User-defined labels to group related ILP products within a family.';
COMMENT ON COLUMN public.ilp_products.ilp_fund_group_id IS 'Optional group; products in the same group display together.';
