-- Junction table: many-to-many between ilp_products and ilp_fund_groups
CREATE TABLE IF NOT EXISTS public.ilp_fund_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_group_id UUID NOT NULL REFERENCES public.ilp_fund_groups(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.ilp_products(id) ON DELETE CASCADE,
  allocation_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(fund_group_id, product_id)
);

CREATE INDEX idx_ilp_fgm_fund_group_id ON public.ilp_fund_group_members(fund_group_id);
CREATE INDEX idx_ilp_fgm_product_id ON public.ilp_fund_group_members(product_id);

ALTER TABLE public.ilp_fund_group_members ENABLE ROW LEVEL SECURITY;

-- Migrate existing data from ilp_products into junction table
INSERT INTO public.ilp_fund_group_members (fund_group_id, product_id, allocation_pct)
SELECT ilp_fund_group_id, id, COALESCE(group_allocation_pct, 0)
FROM public.ilp_products
WHERE ilp_fund_group_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Drop old columns from ilp_products
ALTER TABLE public.ilp_products DROP CONSTRAINT IF EXISTS ilp_products_ilp_fund_group_id_fkey;
DROP INDEX IF EXISTS idx_ilp_products_ilp_fund_group_id;
ALTER TABLE public.ilp_products DROP COLUMN IF EXISTS ilp_fund_group_id;
ALTER TABLE public.ilp_products DROP COLUMN IF EXISTS group_allocation_pct;
