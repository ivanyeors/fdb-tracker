-- =============================================================================
-- Seed: AIA Elite Adventurous Fund (Group ILP) for Ivan
-- Source: docs/ILP-Funds/AIA-PRE/AIA_Elite_Adventurous_Fund.md
-- Data as at: 28 February 2026
-- =============================================================================
-- Run in Supabase SQL Editor

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Resolve Ivan's profile_id and family_id
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_family_id  UUID;
  v_profile_id UUID;
  v_group_id   UUID;
  v_prod_systematic UUID;
  v_prod_select     UUID;
  v_prod_quality    UUID;
  v_prod_etf        UUID;
  v_prod_multi      UUID;
  v_prod_corpbond   UUID;
  v_prod_growth     UUID;
  v_prod_fixedinc   UUID;
BEGIN

  -- Find Ivan's profile (case-insensitive match)
  SELECT p.id, p.family_id
    INTO v_profile_id, v_family_id
    FROM profiles p
   WHERE lower(p.name) LIKE '%ivan%'
   LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile "Ivan" not found. Check profiles table.';
  END IF;

  RAISE NOTICE 'Found Ivan: profile_id=%, family_id=%', v_profile_id, v_family_id;

  -- ---------------------------------------------------------------------------
  -- 2. Create ILP Fund Group: "AIA Elite Adventurous"
  -- ---------------------------------------------------------------------------
  INSERT INTO ilp_fund_groups (family_id, profile_id, name, group_premium_amount, premium_payment_mode)
  VALUES (v_family_id, v_profile_id, 'AIA Elite Adventurous', NULL, 'monthly')
  RETURNING id INTO v_group_id;

  RAISE NOTICE 'Created group: %', v_group_id;

  -- ---------------------------------------------------------------------------
  -- 3. Create ILP Products (one per underlying fund)
  --    monthly_premium = 0 for now (will be set via group allocation)
  --    start_date = fund launch date (19 Jul 2019)
  --    end_date = far future placeholder
  -- ---------------------------------------------------------------------------

  -- AIA Global Systematic Equity Fund (BlackRock) — 31.47%
  INSERT INTO ilp_products (family_id, profile_id, name, monthly_premium, start_date, end_date, premium_payment_mode)
  VALUES (v_family_id, v_profile_id, 'AIA Global Systematic Equity Fund', 0, '2019-07-19', '2060-12-31', 'monthly')
  RETURNING id INTO v_prod_systematic;

  -- AIA Global Select Equity Fund (Capital International) — 22.22%
  INSERT INTO ilp_products (family_id, profile_id, name, monthly_premium, start_date, end_date, premium_payment_mode)
  VALUES (v_family_id, v_profile_id, 'AIA Global Select Equity Fund', 0, '2019-07-19', '2060-12-31', 'monthly')
  RETURNING id INTO v_prod_select;

  -- AIA World Quality Equity Fund (GMO) — 19.20%
  INSERT INTO ilp_products (family_id, profile_id, name, monthly_premium, start_date, end_date, premium_payment_mode)
  VALUES (v_family_id, v_profile_id, 'AIA World Quality Equity Fund', 0, '2019-07-19', '2060-12-31', 'monthly')
  RETURNING id INTO v_prod_quality;

  -- ETFs/Index Funds — 14.20%
  INSERT INTO ilp_products (family_id, profile_id, name, monthly_premium, start_date, end_date, premium_payment_mode)
  VALUES (v_family_id, v_profile_id, 'AIA Elite Adventurous - ETFs/Index Funds', 0, '2019-07-19', '2060-12-31', 'monthly')
  RETURNING id INTO v_prod_etf;

  -- AIA New Multinationals Fund (Wellington) — 5.54%
  INSERT INTO ilp_products (family_id, profile_id, name, monthly_premium, start_date, end_date, premium_payment_mode)
  VALUES (v_family_id, v_profile_id, 'AIA New Multinationals Fund', 0, '2019-07-19', '2060-12-31', 'monthly')
  RETURNING id INTO v_prod_multi;

  -- AIA Global Corporate Bond Fund (M&G) — 2.64%
  INSERT INTO ilp_products (family_id, profile_id, name, monthly_premium, start_date, end_date, premium_payment_mode)
  VALUES (v_family_id, v_profile_id, 'AIA Global Corporate Bond Fund', 0, '2019-07-19', '2060-12-31', 'monthly')
  RETURNING id INTO v_prod_corpbond;

  -- AIA Global Quality Growth Fund (Baillie Gifford) — 2.42%
  INSERT INTO ilp_products (family_id, profile_id, name, monthly_premium, start_date, end_date, premium_payment_mode)
  VALUES (v_family_id, v_profile_id, 'AIA Global Quality Growth Fund', 0, '2019-07-19', '2060-12-31', 'monthly')
  RETURNING id INTO v_prod_growth;

  -- AIA Diversified Fixed Income Fund (BlackRock) — 1.22%
  INSERT INTO ilp_products (family_id, profile_id, name, monthly_premium, start_date, end_date, premium_payment_mode)
  VALUES (v_family_id, v_profile_id, 'AIA Diversified Fixed Income Fund', 0, '2019-07-19', '2060-12-31', 'monthly')
  RETURNING id INTO v_prod_fixedinc;

  RAISE NOTICE 'Created 8 ILP products';

  -- ---------------------------------------------------------------------------
  -- 4. Link products to group with allocation percentages
  --    Note: Cash & Derivative (0.60%) and Money Market (0.49%) excluded as products
  --    Allocations below are of the invested portion, normalized to sum ~99%
  -- ---------------------------------------------------------------------------

  INSERT INTO ilp_fund_group_members (fund_group_id, product_id, allocation_pct) VALUES
    (v_group_id, v_prod_systematic, 31.47),
    (v_group_id, v_prod_select,     22.22),
    (v_group_id, v_prod_quality,    19.20),
    (v_group_id, v_prod_etf,        14.20),
    (v_group_id, v_prod_multi,       5.54),
    (v_group_id, v_prod_corpbond,    2.64),
    (v_group_id, v_prod_growth,      2.42),
    (v_group_id, v_prod_fixedinc,    1.22);

  RAISE NOTICE 'Linked products to group with allocation %%';

  -- ---------------------------------------------------------------------------
  -- 5. Create ILP entries for February 2026 (fund values from AIA app screenshots)
  --    Total current value: SGD 28,929.06
  -- ---------------------------------------------------------------------------

  INSERT INTO ilp_entries (product_id, month, fund_value) VALUES
    (v_prod_systematic, '2026-02-01', 9103.98),
    (v_prod_select,     '2026-02-01', 6428.04),
    (v_prod_quality,    '2026-02-01', 5554.38),
    (v_prod_etf,        '2026-02-01', 4107.93),
    (v_prod_multi,      '2026-02-01', 1602.67),
    (v_prod_corpbond,   '2026-02-01', 763.73),
    (v_prod_growth,     '2026-02-01', 700.08),
    (v_prod_fixedinc,   '2026-02-01', 352.93);

  RAISE NOTICE 'Created Feb 2026 entries. Total: SGD 28,929.06 (excl cash/money market)';
  RAISE NOTICE 'Done! AIA Elite Adventurous group seeded for Ivan.';

END $$;

COMMIT;
