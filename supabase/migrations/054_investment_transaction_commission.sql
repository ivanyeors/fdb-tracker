-- Add broker commission/fee column to investment_transactions
ALTER TABLE public.investment_transactions
  ADD COLUMN IF NOT EXISTS commission NUMERIC(10,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.investment_transactions.commission IS
  'Broker commission/fee in transaction currency (e.g. USD). Applies to stock/ETF buy/sell.';
