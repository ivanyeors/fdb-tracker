-- 057_deduplicate_investments.sql
-- Merge duplicate rows in `investments` created by insert paths that lacked a
-- dedup check (onboarding, web Add Holding, PDF import, and telegram /buy
-- when its .maybeSingle() check already collided with an earlier duplicate).
-- Then add partial unique indexes so future inserts can't reintroduce dupes.
--
-- Duplicate key: (family_id, profile_id, symbol, type). Survivor is the
-- earliest row (MIN(created_at), MIN(id)). Loser transactions are repointed
-- to the survivor before losers are deleted. `account_id`, `date_added`, and
-- other metadata on losers are dropped — the survivor keeps its own.
-- Transaction-level history is preserved in `investment_transactions`.
--
-- Depends on: 006_initial_schema, 008_add_families, 015_telegram_profile_link,
-- 056_investment_account_names

BEGIN;

-- 1. Dedup in a single PL/pgSQL block so all three steps (repoint, update,
--    delete) happen before the unique indexes are created.
DO $$
DECLARE
  grp RECORD;
  survivor_id UUID;
  loser_ids UUID[];
  total_units NUMERIC(14,6);
  merged_cost NUMERIC(14,2);
BEGIN
  FOR grp IN
    SELECT
      family_id,
      profile_id,
      symbol,
      type,
      array_agg(id ORDER BY created_at ASC, id ASC) AS ids
    FROM public.investments
    GROUP BY family_id, profile_id, symbol, type
    HAVING count(*) > 1
  LOOP
    survivor_id := grp.ids[1];
    loser_ids := grp.ids[2:array_length(grp.ids, 1)];

    SELECT
      SUM(units),
      CASE
        WHEN SUM(units) > 0 THEN SUM(units * cost_basis) / SUM(units)
        ELSE AVG(cost_basis)
      END
    INTO total_units, merged_cost
    FROM public.investments
    WHERE id = ANY(grp.ids);

    -- Repoint transactions before delete so FK doesn't block us.
    UPDATE public.investment_transactions
    SET investment_id = survivor_id
    WHERE investment_id = ANY(loser_ids);

    UPDATE public.investments
    SET units = total_units,
        cost_basis = merged_cost
    WHERE id = survivor_id;

    DELETE FROM public.investments
    WHERE id = ANY(loser_ids);
  END LOOP;
END $$;

-- 2. Partial unique indexes. Split because profile_id is nullable and Postgres
--    treats NULLs as distinct in a standard unique index.
CREATE UNIQUE INDEX IF NOT EXISTS investments_family_profile_symbol_type_uniq
  ON public.investments (family_id, profile_id, symbol, type)
  WHERE profile_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS investments_family_symbol_type_uniq
  ON public.investments (family_id, symbol, type)
  WHERE profile_id IS NULL;

COMMIT;
