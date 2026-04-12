-- Self-help group fund (CDAC, SINDA, MBMF, ECF) per profile
-- Deducted from payroll alongside CPF. "none" means opted out.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS self_help_group TEXT NOT NULL DEFAULT 'none';

ALTER TABLE profiles
  ADD CONSTRAINT profiles_self_help_group_check
  CHECK (self_help_group IN ('cdac', 'sinda', 'mbmf', 'ecf', 'none'));
