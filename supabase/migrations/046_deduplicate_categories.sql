-- Migration 046: Deduplicate outflow_categories and enforce uniqueness
-- Root cause: no UNIQUE constraint on (household_id, name) allowed duplicate category names

BEGIN;

-- Step 1: Reassign all FK references from duplicate categories to the keeper
-- Keeper = prefer is_system=true, then oldest created_at
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    WITH ranked AS (
      SELECT id, household_id, name,
        ROW_NUMBER() OVER (
          PARTITION BY household_id, LOWER(name)
          ORDER BY is_system DESC, created_at ASC
        ) AS rn
      FROM outflow_categories
    )
    SELECT r.id AS dupe_id, keeper.id AS keeper_id
    FROM ranked r
    JOIN ranked keeper
      ON keeper.household_id = r.household_id
      AND LOWER(keeper.name) = LOWER(r.name)
      AND keeper.rn = 1
    WHERE r.rn > 1
  LOOP
    -- Reassign bank_transactions
    UPDATE bank_transactions
      SET category_id = rec.keeper_id
      WHERE category_id = rec.dupe_id;

    -- Reassign outflow_entries
    UPDATE outflow_entries
      SET category_id = rec.keeper_id
      WHERE category_id = rec.dupe_id;

    -- Delete duplicate category_rules (may conflict with keeper's rules)
    DELETE FROM category_rules
      WHERE category_id = rec.dupe_id;

    -- Delete the duplicate category
    DELETE FROM outflow_categories
      WHERE id = rec.dupe_id;
  END LOOP;
END $$;

-- Step 2: Add unique constraint on (household_id, name) for exact match + ON CONFLICT support
ALTER TABLE outflow_categories
  ADD CONSTRAINT uq_outflow_categories_household_name UNIQUE (household_id, name);

-- Step 3: Add case-insensitive unique index to prevent "Food & Dining" vs "food & dining"
CREATE UNIQUE INDEX idx_outflow_categories_household_name_ci
  ON outflow_categories (household_id, LOWER(name));

COMMIT;
