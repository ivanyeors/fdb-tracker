-- Remove OCR / Mindee feature (paid service, no longer used)

DROP TABLE IF EXISTS ocr_uploads;

-- Remove 'ocr' from monthly_cashflow.source CHECK constraint
ALTER TABLE monthly_cashflow DROP CONSTRAINT IF EXISTS monthly_cashflow_source_check;
ALTER TABLE monthly_cashflow ADD CONSTRAINT monthly_cashflow_source_check
  CHECK (source IN ('manual', 'telegram'));
