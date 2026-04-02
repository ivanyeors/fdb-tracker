-- Add updated_at to outflow_categories for tracking edits
ALTER TABLE outflow_categories
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
