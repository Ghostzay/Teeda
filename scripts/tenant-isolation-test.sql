-- ============================================================================
-- Cross-tenant isolation: the proof.
--
-- Two salons, A and B, each with rows in EVERY tenant-scoped table. Then,
-- authenticated as salon A (owner and tech), assert that zero rows belonging
-- to salon B are reachable — table by table, discovered dynamically from
-- information_schema so a table added next year is asserted automatically,
-- and the test FAILS OUTRIGHT if the seed has no B rows for it. A test that
-- silently skips an unseeded table is a test that passes while leaking.
--
-- Run against a database with all migrations applied (never production):
--
--   psql -v ON_ERROR_STOP=1 -d <db> -f scripts/tenant-isolation-test.sql
--
-- Exits non-zero on any failure. Prints one line per assertion.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Accounting. A real table (not temp): it must survive `set role`.
-- ----------------------------------------------------------------------------
drop table if exists public._iso_failures;
create table public._iso_failures (detail text);
grant all on public._iso_failures to authenticated;

-- ----------------------------------------------------------------------------
-- Seed. Superuser, RLS bypassed — this is arranging the world, not testing it.
-- ----------------------------------------------------------------------------
delete from public.salons where id in
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');
delete from auth.users where id in
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001',
   'aaaaaaaa-3333-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000001',
   'bbbbbbbb-2222-0000-0000-000000000001', 'bbbbbbbb-3333-0000-0000-000000000001');

insert into public.salons (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Salon A', 'salon-a'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Salon B', 'salon-b');

insert into auth.users (id, email) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'owner-a@iso.test'),
  ('aaaaaaaa-2222-0000-0000-000000000001', 'tech-a@iso.test'),
  ('aaaaaaaa-3333-0000-0000-000000000001', 'kiosk-a@iso.test'),
  ('bbbbbbbb-1111-0000-0000-000000000001', 'owner-b@iso.test'),
  ('bbbbbbbb-2222-0000-0000-000000000001', 'tech-b@iso.test'),
  ('bbbbbbbb-3333-0000-0000-000000000001', 'kiosk-b@iso.test');

-- Profiles. The kiosk-role rows also create kiosk_devices via trigger.
insert into public.profiles (id, salon_id, full_name, role) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Owner A', 'manager'),
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Tech A',  'tech'),
  ('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Kiosk A', 'kiosk'),
  ('bbbbbbbb-1111-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Owner B', 'manager'),
  ('bbbbbbbb-2222-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Tech B',  'tech'),
  ('bbbbbbbb-3333-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Kiosk B', 'kiosk');

do $$
declare
  a  uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  b  uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  s  uuid;
  owner_id uuid; tech_id uuid; kiosk_id uuid;
  cust uuid; svc uuid; appt uuid; job uuid;
begin
  foreach s in array array[a, b] loop
    owner_id := case when s = a then 'aaaaaaaa-1111-0000-0000-000000000001'::uuid
                     else 'bbbbbbbb-1111-0000-0000-000000000001'::uuid end;
    tech_id  := case when s = a then 'aaaaaaaa-2222-0000-0000-000000000001'::uuid
                     else 'bbbbbbbb-2222-0000-0000-000000000001'::uuid end;
    kiosk_id := case when s = a then 'aaaaaaaa-3333-0000-0000-000000000001'::uuid
                     else 'bbbbbbbb-3333-0000-0000-000000000001'::uuid end;

    insert into public.customers (salon_id, name, phone)
    values (s, 'Client of ' || s, '555' || left(replace(s::text, '-', ''), 7))
    returning id into cust;

    insert into public.services (salon_id, name, price, duration_minutes)
    values (s, 'ISO Test Service', 45, 45) returning id into svc;

    insert into public.appointments (salon_id, customer_id, tech_id, scheduled_at, service_name)
    values (s, cust, tech_id, now() + interval '2 hours', 'ISO Test Service')
    returning id into appt;

    insert into public.appointment_services (salon_id, appointment_id, service_id, name, price)
    values (s, appt, svc, 'ISO Test Service', 45);

    insert into public.jobs (salon_id, customer_id, tech_id, service_name, status)
    values (s, cust, tech_id, 'ISO Test Service', 'in_progress') returning id into job;

    insert into public.job_services (salon_id, job_id, service_id, name, price)
    values (s, job, svc, 'ISO Test Service', 45);

    insert into public.payments (salon_id, job_id, tech_id, service_amount, tip_amount)
    values (s, job, tech_id, 45, 10);

    insert into public.tech_pay (salon_id, tech_id) values (s, tech_id);
    insert into public.tech_profiles (tech_id, salon_id, bio) values (tech_id, s, 'Bio');
    insert into public.turn_checkins (salon_id, tech_id, checkin_date) values (s, tech_id, current_date);

    insert into public.schedule_blocks
      (salon_id, tech_id, starts_at, ends_at, blocked_from, blocked_to, kind)
    values (s, tech_id, now(), now() + interval '1 hour',
            now(), now() + interval '1 hour', 'appointment');

    insert into public.shift_blocks (salon_id, tech_id, starts_at, ends_at)
    values (s, tech_id, date_trunc('day', now()) + interval '9 hours',
            date_trunc('day', now()) + interval '17 hours');

    insert into public.availability_patterns (salon_id, tech_id, weekdays, start_time, end_time)
    values (s, tech_id, '{1,2,3}', '09:00', '17:00');

    insert into public.notifications (salon_id, user_id, type, title)
    values (s, owner_id, 'job_assigned', 'Hello owner'),
           (s, tech_id, 'job_assigned', 'Hello tech');

    insert into public.kiosk_pin_attempts (salon_id, device_key, succeeded)
    values (s, 'device-' || s, false);

    insert into public.kiosk_lookups (kiosk_id, matched) values (kiosk_id, true);
  end loop;
end $$;

-- Platform-layer tables (added by the provisioning migration) reference
-- salons without belonging to one. They must be INVISIBLE below the platform,
-- which the same zero-B-rows assertion proves — so seed them a B-referencing
-- row each and let the loop treat them like everything else.
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
insert into public.impersonations (admin_id, salon_id)
values ('99999999-1111-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001')
on conflict (admin_id) do update set salon_id = excluded.salon_id;
insert into public.platform_audit_log (admin_id, action, salon_id)
values ('99999999-1111-0000-0000-000000000001', 'iso_test', 'bbbbbbbb-0000-0000-0000-000000000001');

-- ----------------------------------------------------------------------------
-- Coverage guard: every table that HAS a salon_id column must hold B rows,
-- or this suite is quietly testing nothing for that table.
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  n bigint;
begin
  for t in
    select c.table_name from information_schema.columns c
    join pg_tables p on p.tablename = c.table_name and p.schemaname = 'public'
    where c.table_schema = 'public' and c.column_name = 'salon_id'
      and c.table_name <> '_iso_failures'
  loop
    execute format(
      'select count(*) from public.%I where salon_id = %L',
      t, 'bbbbbbbb-0000-0000-0000-000000000001') into n;
    if n = 0 then
      insert into public._iso_failures values
        ('COVERAGE: table ' || t || ' has salon_id but the seed gave it no salon-B rows — extend the seed');
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- The assertions, as salon A. Owner first, then tech: two privilege levels,
-- same requirement — zero reachable salon-B rows, on every table.
-- ----------------------------------------------------------------------------
set role authenticated;

\echo '--- as OWNER of salon A ---'
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1111-0000-0000-000000000001"}', false);

do $$
declare
  t text;
  b_rows bigint;
  a_rows bigint;
begin
  for t in
    select c.table_name from information_schema.columns c
    join pg_tables p on p.tablename = c.table_name and p.schemaname = 'public'
    where c.table_schema = 'public' and c.column_name = 'salon_id'
      and c.table_name <> '_iso_failures'
  loop
    execute format(
      'select
         count(*) filter (where salon_id = %L),
         count(*) filter (where salon_id = %L)
       from public.%I',
      'bbbbbbbb-0000-0000-0000-000000000001',
      'aaaaaaaa-0000-0000-0000-000000000001', t) into b_rows, a_rows;

    if b_rows > 0 then
      insert into public._iso_failures values
        ('LEAK: owner A can read ' || b_rows || ' salon-B row(s) from ' || t);
    end if;
    raise notice '%  owner-A  %  B-rows visible: %  (own rows: %)',
      case when b_rows = 0 then 'PASS' else 'FAIL' end, rpad(t, 24), b_rows, a_rows;
  end loop;
end $$;

-- Vacuous-pass guard: an owner who can see NOTHING of their own salon would
-- also "see zero B rows". Prove the session actually works.
do $$
declare n bigint;
begin
  select count(*) into n from public.customers
   where salon_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n = 0 then
    insert into public._iso_failures values
      ('VACUOUS: owner A sees zero rows of their OWN salon — the session is broken, not isolated');
  end if;
  raise notice '%  owner-A sees own data (customers: %)', case when n > 0 then 'PASS' else 'FAIL' end, n;
end $$;

-- The salons table itself: exactly one row, and it is A.
do $$
declare n bigint; wrong bigint;
begin
  select count(*), count(*) filter (where id <> 'aaaaaaaa-0000-0000-0000-000000000001')
    into n, wrong from public.salons;
  if wrong > 0 then
    insert into public._iso_failures values ('LEAK: owner A can read another salon''s row in salons');
  end if;
  raise notice '%  owner-A  salons: sees % row(s), foreign: %',
    case when wrong = 0 then 'PASS' else 'FAIL' end, n, wrong;
end $$;

-- kiosk_lookups (no salon_id): scoped through kiosk_devices.
do $$
declare foreign_rows bigint;
begin
  select count(*) into foreign_rows
  from public.kiosk_lookups l
  where l.kiosk_id = 'bbbbbbbb-3333-0000-0000-000000000001';
  if foreign_rows > 0 then
    insert into public._iso_failures values ('LEAK: owner A can read salon-B kiosk lookups');
  end if;
  raise notice '%  owner-A  kiosk_lookups: B rows visible: %',
    case when foreign_rows = 0 then 'PASS' else 'FAIL' end, foreign_rows;
end $$;

-- Write paths. An UPDATE that touches zero rows is RLS working; an INSERT
-- into salon B must throw.
do $$
declare n bigint;
begin
  update public.customers set name = 'stolen'
   where salon_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n > 0 then
    insert into public._iso_failures values ('LEAK: owner A UPDATED ' || n || ' salon-B customer row(s)');
  end if;
  raise notice '%  owner-A  cross-tenant UPDATE touched % row(s)',
    case when n = 0 then 'PASS' else 'FAIL' end, n;

  update public.salons set name = 'stolen'
   where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n > 0 then
    insert into public._iso_failures values ('LEAK: owner A renamed salon B');
  end if;
  raise notice '%  owner-A  cross-tenant salon UPDATE touched % row(s)',
    case when n = 0 then 'PASS' else 'FAIL' end, n;

  begin
    insert into public.customers (salon_id, name)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'planted');
    insert into public._iso_failures values ('LEAK: owner A INSERTED a customer into salon B');
    raise notice 'FAIL  owner-A  cross-tenant INSERT was accepted';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS  owner-A  cross-tenant INSERT refused (%)', sqlstate;
  end;
end $$;

\echo '--- as TECH of salon A ---'
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-2222-0000-0000-000000000001"}', false);

do $$
declare
  t text;
  b_rows bigint;
begin
  for t in
    select c.table_name from information_schema.columns c
    join pg_tables p on p.tablename = c.table_name and p.schemaname = 'public'
    where c.table_schema = 'public' and c.column_name = 'salon_id'
      and c.table_name <> '_iso_failures'
  loop
    execute format(
      'select count(*) from public.%I where salon_id = %L',
      t, 'bbbbbbbb-0000-0000-0000-000000000001') into b_rows;
    if b_rows > 0 then
      insert into public._iso_failures values
        ('LEAK: tech A can read ' || b_rows || ' salon-B row(s) from ' || t);
    end if;
    raise notice '%  tech-A   %  B-rows visible: %',
      case when b_rows = 0 then 'PASS' else 'FAIL' end, rpad(t, 24), b_rows;
  end loop;
end $$;

reset role;

-- ----------------------------------------------------------------------------
-- Verdict. Non-zero exit under ON_ERROR_STOP when anything failed.
-- ----------------------------------------------------------------------------
select detail as failure from public._iso_failures;

do $$
declare n bigint;
begin
  select count(*) into n from public._iso_failures;
  if n > 0 then
    raise exception 'TENANT ISOLATION: % failure(s) — see rows above', n;
  end if;
  raise notice '';
  raise notice 'TENANT ISOLATION: all assertions passed.';
end $$;

drop table public._iso_failures;
