-- 048_collectible_investments.sql
-- Collectible investment tracking: dynamic tabs, cards/sealed products, and generic others.

-- ============================================================
-- 1. investment_tabs — user-created investment category tabs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.investment_tabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  tab_type TEXT NOT NULL CHECK (tab_type IN ('cards', 'others')),
  tab_label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investment_tabs_family_id ON public.investment_tabs(family_id);
ALTER TABLE public.investment_tabs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. collectible_cards — graded slabs, raw cards, sealed products
-- ============================================================
CREATE TABLE IF NOT EXISTS public.collectible_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tab_id UUID NOT NULL REFERENCES public.investment_tabs(id) ON DELETE CASCADE,

  -- Simple fields (always filled)
  name TEXT NOT NULL,
  type_label TEXT NOT NULL DEFAULT 'Other Sealed',
  purchase_price NUMERIC(12,2) NOT NULL,
  current_value NUMERIC(12,2),
  value_updated_at TIMESTAMPTZ,

  -- Detailed fields (all optional)
  set_name TEXT,
  franchise TEXT DEFAULT 'Pokemon',
  language TEXT DEFAULT 'English',
  edition TEXT,
  card_number TEXT,
  grading_company TEXT,
  grade NUMERIC(3,1),
  cert_number TEXT,
  condition TEXT,
  rarity TEXT,
  quantity INT NOT NULL DEFAULT 1,
  purchase_date DATE,
  notes TEXT,
  image_url TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collectible_cards_family_id ON public.collectible_cards(family_id);
CREATE INDEX IF NOT EXISTS idx_collectible_cards_profile_id ON public.collectible_cards(profile_id);
CREATE INDEX IF NOT EXISTS idx_collectible_cards_tab_id ON public.collectible_cards(tab_id);
ALTER TABLE public.collectible_cards ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. collectible_others — generic collectibles (LEGO, watches, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.collectible_others (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tab_id UUID NOT NULL REFERENCES public.investment_tabs(id) ON DELETE CASCADE,

  -- Simple fields
  name TEXT NOT NULL,
  type_label TEXT NOT NULL DEFAULT 'Other',
  purchase_price NUMERIC(12,2) NOT NULL,
  current_value NUMERIC(12,2),
  value_updated_at TIMESTAMPTZ,

  -- Detailed fields (all optional)
  brand TEXT,
  description TEXT,
  condition TEXT,
  quantity INT NOT NULL DEFAULT 1,
  purchase_date DATE,
  notes TEXT,
  image_url TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collectible_others_family_id ON public.collectible_others(family_id);
CREATE INDEX IF NOT EXISTS idx_collectible_others_profile_id ON public.collectible_others(profile_id);
CREATE INDEX IF NOT EXISTS idx_collectible_others_tab_id ON public.collectible_others(tab_id);
ALTER TABLE public.collectible_others ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.investment_tabs IS 'User-created investment category tabs (cards, others).';
COMMENT ON TABLE public.collectible_cards IS 'Trading card and sealed product investments (graded, raw, sealed).';
COMMENT ON TABLE public.collectible_others IS 'Generic collectible investments (LEGO, watches, figurines, etc.).';
