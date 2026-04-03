-- Income History
-- Supports multiple employers per profile with date ranges.
-- Used for accurate month-by-month CPF contribution calculations
-- when a user changes jobs mid-year.

create table if not exists income_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  employer_name text not null,
  monthly_salary numeric(12,2) not null,
  start_date date not null,
  end_date date,                              -- null = current/ongoing
  is_primary boolean not null default true,    -- primary vs side gig
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for efficient lookups by profile + date range
create index if not exists idx_income_history_profile_date
  on income_history (profile_id, start_date, end_date);

-- RLS enabled; all access goes through service role (createSupabaseAdmin).
alter table income_history enable row level security;
