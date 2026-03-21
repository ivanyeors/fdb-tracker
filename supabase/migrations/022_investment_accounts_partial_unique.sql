-- 022_investment_accounts_partial_unique.sql
-- PostgreSQL treats NULL as distinct in UNIQUE (family_id, profile_id), so multiple
-- family-level rows (profile_id IS NULL) were allowed, breaking .maybeSingle() (PGRST116).
-- Deduplicate, then replace the constraint with partial unique indexes.

-- Merge balances into the newest row per family for duplicate family-level accounts, then remove extras.
WITH dup_families AS (
  SELECT family_id
  FROM public.investment_accounts
  WHERE profile_id IS NULL
  GROUP BY family_id
  HAVING COUNT(*) > 1
),
totals AS (
  SELECT ia.family_id, SUM(ia.cash_balance)::numeric(14,2) AS total_bal
  FROM public.investment_accounts ia
  INNER JOIN dup_families d ON d.family_id = ia.family_id
  WHERE ia.profile_id IS NULL
  GROUP BY ia.family_id
),
keepers AS (
  SELECT DISTINCT ON (ia.family_id)
    ia.id AS keep_id,
    ia.family_id
  FROM public.investment_accounts ia
  INNER JOIN dup_families d ON d.family_id = ia.family_id
  WHERE ia.profile_id IS NULL
  ORDER BY ia.family_id, ia.updated_at DESC NULLS LAST, ia.id
)
UPDATE public.investment_accounts ia
SET cash_balance = t.total_bal,
    updated_at = NOW()
FROM keepers k
JOIN totals t ON t.family_id = k.family_id
WHERE ia.id = k.keep_id;

DELETE FROM public.investment_accounts a
WHERE a.id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY family_id
             ORDER BY updated_at DESC NULLS LAST, id
           ) AS rn
    FROM public.investment_accounts
    WHERE profile_id IS NULL
  ) x
  WHERE x.rn > 1
);

ALTER TABLE public.investment_accounts
  DROP CONSTRAINT IF EXISTS investment_accounts_family_id_profile_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS investment_accounts_family_one_shared
  ON public.investment_accounts (family_id)
  WHERE profile_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS investment_accounts_family_profile_unique
  ON public.investment_accounts (family_id, profile_id)
  WHERE profile_id IS NOT NULL;
