-- Signup & invite codes for Telegram sign-up and household invite flows
create table if not exists signup_codes (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('signup', 'invite')),
  code text not null unique,
  -- For 'signup': null (no household yet). For 'invite': the household to join.
  household_id uuid references households(id) on delete cascade,
  -- For 'signup': the Telegram username provided during web sign-up.
  telegram_username text,
  -- For 'invite': optional profile_id hint (admin can pre-select which profile to link).
  target_profile_id uuid references profiles(id) on delete set null,
  -- Who created the code
  created_by_household_id uuid references households(id) on delete set null,
  used boolean not null default false,
  -- Who consumed it (set on redemption)
  used_by_telegram_user_id text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index idx_signup_codes_code on signup_codes (code) where used = false;
create index idx_signup_codes_household on signup_codes (household_id) where type = 'invite';

alter table signup_codes enable row level security;
