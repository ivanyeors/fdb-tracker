-- CPF Healthcare Config
-- Stores per-profile healthcare premium information for accurate MA projections.
-- MSL (MediShield Life) uses age-based default unless overridden.
-- CSL, SUP, PMI are user-entered from CPF statement.

create table if not exists cpf_healthcare_config (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  msl_annual_override numeric(10,2),          -- null = use age-based estimate
  csl_annual numeric(10,2) not null default 0,
  csl_supplement_annual numeric(10,2) not null default 0,
  isp_annual numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id)
);

-- RLS enabled; all access goes through service role (createSupabaseAdmin),
-- matching the pattern used by all other tables in this project.
alter table cpf_healthcare_config enable row level security;
