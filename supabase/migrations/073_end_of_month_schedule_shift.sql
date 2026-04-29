-- Shift end_of_month reminder from day 28 (within current month) to day 5
-- (a few days into the next month), so it fires after bank statements are
-- typically published. The cron route now passes the previous month's label
-- to the reminder template.
UPDATE prompt_schedule
SET day_of_month = 5
WHERE prompt_type = 'end_of_month'
  AND frequency = 'monthly'
  AND day_of_month = 28;
