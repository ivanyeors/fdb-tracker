-- Optional conversational notes from Telegram /in and /out (and dashboard later)
ALTER TABLE monthly_cashflow
  ADD COLUMN IF NOT EXISTS inflow_memo TEXT,
  ADD COLUMN IF NOT EXISTS outflow_memo TEXT;
