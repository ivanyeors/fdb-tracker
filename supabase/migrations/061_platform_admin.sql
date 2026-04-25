-- Platform-level super-admin role.
-- Gates the Telegram /auth + /link commands, the API key management UI,
-- and the /settings/admins lookup page.

alter table households
  add column if not exists is_super_admin boolean not null default false;

-- Seed the initial super-admin (your current family profile's household).
-- BEFORE APPLYING: replace the placeholder UUID below with your own
-- households.id. The assertion at the bottom will fail loudly if the
-- update affected zero rows.
update households
  set is_super_admin = true
  where id = '8006c583-db27-4724-8ec2-63c5bc07ac3e'::uuid;

do $$
begin
  if (select count(*) from households where is_super_admin) = 0 then
    raise exception
      'super admin seed missed: no household has is_super_admin=true. '
      'Edit the UUID in 060_platform_admin.sql before applying.';
  end if;
end $$;
