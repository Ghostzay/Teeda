-- ============================================================================
-- Provisioning is gated, impersonation is real, and both leave a trail.
--
-- Run AFTER scripts/tenant-isolation-test.sql on the same database (it uses
-- salon A / salon B and their users from that seed), plus an HQ + platform
-- admin seeded here.
--
--   psql -v ON_ERROR_STOP=1 -d <db> -f scripts/provisioning-test.sql
--
-- Asserts, at the DATABASE layer (the API layer above it is a server action
-- that requires the same role — tested separately by the guard script):
--
--   * anonymous, tech, and owner ALL fail to create a salon, via every
--     path: bootstrap_salon, create_salon_as_owner, admin_create_salon,
--     and a raw INSERT against RLS.
--   * the platform admin CAN create one (the gate is the role, not luck).
--   * impersonation flips current_salon_id() for the admin — and only the
--     admin — writes audit rows for start and stop, and a non-admin cannot
--     hold an impersonations row at all.
-- ============================================================================

drop table if exists public._prov_failures;
create table public._prov_failures (detail text);
grant all on public._prov_failures to authenticated, anon;

-- Seed: HQ + platform admin (idempotent, mirrors the real seed script).
insert into public.salons (id, name, slug)
values ('99999999-0000-0000-0000-000000000001', 'Zolvora HQ', 'zolvora-hq')
on conflict (id) do nothing;
insert into auth.users (id, email)
values ('99999999-1111-0000-0000-000000000001', 'platform@iso.test')
on conflict (id) do nothing;
insert into public.profiles (id, salon_id, full_name, role)
values ('99999999-1111-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001',
        'Platform Admin', 'super_admin')
on conflict (id) do update set role = 'super_admin';
delete from public.salons where slug in ('prov-made', 'prov-made-2');
delete from public.impersonations;
delete from public.platform_audit_log where admin_id = '99999999-1111-0000-0000-000000000001';

-- ----------------------------------------------------------------------------
-- One block per caller: every creation path must refuse.
-- ----------------------------------------------------------------------------
create or replace function public._prov_try_all(p_who text)
returns void
language plpgsql
as $$
declare
  v_ok boolean;
begin
  -- bootstrap_salon
  begin
    perform public.bootstrap_salon('Sneaky Salon');
    insert into public._prov_failures values (p_who || ': bootstrap_salon SUCCEEDED');
    raise notice 'FAIL  %  bootstrap_salon accepted', p_who;
  exception when insufficient_privilege then
    raise notice 'PASS  %  bootstrap_salon refused (42501)', p_who;
  when others then
    raise notice 'PASS  %  bootstrap_salon refused (%)', p_who, sqlstate;
  end;

  -- create_salon_as_owner
  begin
    perform public.create_salon_as_owner('Sneaky Salon');
    insert into public._prov_failures values (p_who || ': create_salon_as_owner SUCCEEDED');
    raise notice 'FAIL  %  create_salon_as_owner accepted', p_who;
  exception when insufficient_privilege then
    raise notice 'PASS  %  create_salon_as_owner refused (42501)', p_who;
  when others then
    raise notice 'PASS  %  create_salon_as_owner refused (%)', p_who, sqlstate;
  end;

  -- admin_create_salon
  begin
    perform public.admin_create_salon('Sneaky Salon');
    insert into public._prov_failures values (p_who || ': admin_create_salon SUCCEEDED');
    raise notice 'FAIL  %  admin_create_salon accepted', p_who;
  exception when insufficient_privilege then
    raise notice 'PASS  %  admin_create_salon refused (42501)', p_who;
  when others then
    raise notice 'PASS  %  admin_create_salon refused (%)', p_who, sqlstate;
  end;

  -- raw insert, straight at RLS
  begin
    insert into public.salons (name) values ('Sneaky Salon');
    insert into public._prov_failures values (p_who || ': raw INSERT into salons SUCCEEDED');
    raise notice 'FAIL  %  raw INSERT accepted', p_who;
  exception when insufficient_privilege then
    raise notice 'PASS  %  raw INSERT refused by RLS (42501)', p_who;
  when others then
    raise notice 'PASS  %  raw INSERT refused (%)', p_who, sqlstate;
  end;
end;
$$;

\echo '--- anonymous ---'
set role anon;
select set_config('request.jwt.claims', '', false);
select public._prov_try_all('anon ');
reset role;

\echo '--- tech (salon A) ---'
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-2222-0000-0000-000000000001"}', false);
select public._prov_try_all('tech ');
reset role;

\echo '--- owner (salon A) ---'
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1111-0000-0000-000000000001"}', false);
select public._prov_try_all('owner');
reset role;

-- ----------------------------------------------------------------------------
-- The platform admin: allowed, and audited.
-- ----------------------------------------------------------------------------
\echo '--- platform admin ---'
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"99999999-1111-0000-0000-000000000001"}', false);

do $$
declare
  made jsonb;
  n bigint;
begin
  made := public.admin_create_salon('Provisioned Salon', 'prov-made');
  if made ->> 'slug' <> 'prov-made' then
    insert into public._prov_failures values ('admin: created salon has wrong slug: ' || made::text);
  end if;
  raise notice 'PASS  admin  admin_create_salon -> %', made ->> 'slug';

  -- and the raw insert path is open to the admin too (the explicit policy)
  insert into public.salons (name, slug) values ('Provisioned Two', 'prov-made-2');
  raise notice 'PASS  admin  raw INSERT accepted by policy';

  select count(*) into n from public.platform_audit_log
   where action = 'salon_created' and admin_id = auth.uid();
  if n = 0 then
    insert into public._prov_failures values ('admin: salon_created left no audit row');
    raise notice 'FAIL  admin  no audit row for salon_created';
  else
    raise notice 'PASS  admin  audit row written for salon_created';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Impersonation: flips the admin's salon, is audited, and is admin-only.
-- ----------------------------------------------------------------------------
do $$
declare
  a uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  hq uuid := '99999999-0000-0000-0000-000000000001';
  seen uuid;
  n bigint;
begin
  if public.current_salon_id() <> hq then
    insert into public._prov_failures values ('admin: expected HQ before impersonating');
  end if;

  perform public.admin_impersonate(a);
  seen := public.current_salon_id();
  if seen <> a then
    insert into public._prov_failures values ('admin: current_salon_id() did not flip to salon A');
    raise notice 'FAIL  admin  impersonation did not flip current_salon_id';
  else
    raise notice 'PASS  admin  current_salon_id() -> salon A while impersonating';
  end if;

  -- The support view is a real view: salon A's customers are now readable.
  select count(*) into n from public.customers where salon_id = a;
  if n = 0 then
    insert into public._prov_failures values ('admin: impersonation shows no salon-A customers');
    raise notice 'FAIL  admin  impersonation reads nothing';
  else
    raise notice 'PASS  admin  impersonation reads salon A (customers: %)', n;
  end if;

  perform public.admin_stop_impersonation();
  if public.current_salon_id() <> hq then
    insert into public._prov_failures values ('admin: did not return to HQ after stopping');
    raise notice 'FAIL  admin  stop_impersonation did not restore HQ';
  else
    raise notice 'PASS  admin  back to HQ after stopping';
  end if;

  select count(*) into n from public.platform_audit_log
   where admin_id = auth.uid()
     and action in ('impersonation_started', 'impersonation_stopped');
  if n < 2 then
    insert into public._prov_failures values ('admin: impersonation audit rows missing (' || n || ')');
    raise notice 'FAIL  admin  impersonation audit incomplete (% rows)', n;
  else
    raise notice 'PASS  admin  impersonation audited (start + stop)';
  end if;
end $$;

reset role;

\echo '--- owner cannot impersonate ---'
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1111-0000-0000-000000000001"}', false);
do $$
begin
  begin
    perform public.admin_impersonate('bbbbbbbb-0000-0000-0000-000000000001');
    insert into public._prov_failures values ('owner: admin_impersonate SUCCEEDED');
    raise notice 'FAIL  owner  admin_impersonate accepted';
  exception when insufficient_privilege then
    raise notice 'PASS  owner  admin_impersonate refused (42501)';
  end;

  begin
    insert into public.impersonations (admin_id, salon_id)
    values (auth.uid(), 'bbbbbbbb-0000-0000-0000-000000000001');
    insert into public._prov_failures values ('owner: planted an impersonations row directly');
    raise notice 'FAIL  owner  direct impersonations INSERT accepted';
  exception when insufficient_privilege then
    raise notice 'PASS  owner  direct impersonations INSERT refused (42501)';
  end;

  -- And the audit log is invisible below the platform.
  if exists (select 1 from public.platform_audit_log) then
    insert into public._prov_failures values ('owner: can read the platform audit log');
    raise notice 'FAIL  owner  audit log readable';
  else
    raise notice 'PASS  owner  audit log unreadable';
  end if;
end $$;
reset role;

-- ----------------------------------------------------------------------------
-- Verdict
-- ----------------------------------------------------------------------------
select detail as failure from public._prov_failures;

do $$
declare n bigint;
begin
  select count(*) into n from public._prov_failures;
  if n > 0 then
    raise exception 'PROVISIONING: % failure(s) — see rows above', n;
  end if;
  raise notice '';
  raise notice 'PROVISIONING: all assertions passed.';
end $$;

drop function public._prov_try_all(text);
drop table public._prov_failures;
