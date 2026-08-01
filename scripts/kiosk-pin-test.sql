-- ============================================================================
-- The kiosk exit PIN, end to end.
--
-- This exists because the PIN was broken in production while every test passed
-- locally, and the difference was one thing: where `pgcrypto` is installed.
-- Supabase puts it in the `extensions` schema. A local `create extension
-- pgcrypto` puts it in `public`. `set_kiosk_exit_pin` pinned
-- `search_path = public`, so on Supabase — and only on Supabase — `gen_salt()`
-- was not on the path and every save died with 42883.
--
-- So run this against BOTH layouts. Passing on one proves nothing; that is the
-- whole lesson of the bug it was written for.
--
--   -- Supabase's layout (the one that broke):
--   create schema if not exists extensions;
--   create extension if not exists pgcrypto schema extensions;
--
--   -- a plain local database:
--   create extension if not exists pgcrypto;
--
-- Then, in a database with the migrations applied and a salon + a manager + a
-- kiosk account seeded, edit the three ids below and run the file.
--
-- Reads and writes only `salons.kiosk_exit_pin_hash` and `kiosk_pin_attempts`,
-- and leaves the PIN set to 0042.
-- ============================================================================

\set manager '''11111111-1111-1111-1111-111111111111'''
\set kiosk   '''22222222-2222-2222-2222-222222222222'''
\set tech    '''33333333-3333-3333-3333-333333333333'''

-- Act as the app does: role `authenticated`, with a JWT, never as the owner of
-- the tables. Running these as superuser would pass with the RLS switched off.
\set as_manager 'set role authenticated; select set_config(''request.jwt.claims'', json_build_object(''sub'', :manager)::text, false);'
\set as_kiosk   'set role authenticated; select set_config(''request.jwt.claims'', json_build_object(''sub'', :kiosk)::text, false);'
\set as_tech    'set role authenticated; select set_config(''request.jwt.claims'', json_build_object(''sub'', :tech)::text, false);'

\echo ''
\echo '=== 1. The owner saves 0042 ==='
:as_manager
do $$
begin
  perform public.set_kiosk_exit_pin('0042');
  raise notice 'PASS  saved';
exception when others then
  raise notice 'FAIL  % : %', sqlstate, sqlerrm;
end $$;

reset role;
\echo '=== 2. What landed in the column ==='
-- Never the digits. bcrypt, or this test is the last thing between a plaintext
-- PIN and a database backup somebody emails around.
select case
  when kiosk_exit_pin_hash is null      then 'FAIL  nothing was saved'
  when kiosk_exit_pin_hash = '0042'     then 'FAIL  PLAINTEXT'
  when kiosk_exit_pin_hash like '$2%'   then 'PASS  bcrypt (' || left(kiosk_exit_pin_hash, 4) || '…)'
  else 'FAIL  unrecognised: ' || kiosk_exit_pin_hash
end as stored
from public.salons s
where s.id = (select p.salon_id from public.profiles p where p.id = :manager);

\echo '=== 3. The settings page reads it back as set ==='
:as_manager
select case when public.salon_has_exit_pin() then 'PASS' else 'FAIL' end as has_pin;

\echo '=== 4. 0042 verifies, 42 does not ==='
-- The leading zero. Store the PIN as an integer anywhere along the way and
-- "0042" comes back as 42 — a PIN nobody can ever type correctly again.
reset role;
:as_kiosk
select
  case when public.kiosk_verify_exit_pin('0042', 'test-a') ->> 'result' = 'ok'
       then 'PASS' else 'FAIL' end as pin_0042,
  case when public.kiosk_verify_exit_pin('42',   'test-b') ->> 'result' = 'wrong'
       then 'PASS' else 'FAIL' end as pin_42_rejected,
  case when public.kiosk_verify_exit_pin('9999', 'test-c') ->> 'result' = 'wrong'
       then 'PASS' else 'FAIL' end as wrong_pin_rejected;

\echo '=== 5. What the RPC accepts: 4 to 6 digits, and nothing else ==='
reset role;
:as_manager
do $$
declare
  p text;
  accepted boolean;
  expected boolean;
begin
  foreach p in array array['123','1234','12345','123456','1234567','12ab','',' 1234'] loop
    expected := p ~ '^\d{4,6}$';
    begin
      perform public.set_kiosk_exit_pin(p);
      accepted := true;
    exception when others then
      accepted := false;
    end;
    raise notice '%  %  (%)',
      case when accepted = expected then 'PASS' else 'FAIL' end,
      rpad(quote_literal(p), 10),
      case when accepted then 'accepted' else 'rejected' end;
  end loop;
end $$;

\echo '=== 6. Only the owner can set it ==='
reset role;
:as_tech
do $$
begin
  perform public.set_kiosk_exit_pin('5555');
  raise notice 'FAIL  a tech set the PIN';
exception when insufficient_privilege then
  raise notice 'PASS  tech refused';
when others then
  raise notice 'FAIL  wrong error: % : %', sqlstate, sqlerrm;
end $$;

reset role;
:as_kiosk
do $$
begin
  perform public.set_kiosk_exit_pin('5555');
  raise notice 'FAIL  the kiosk set the PIN';
exception when insufficient_privilege then
  raise notice 'PASS  kiosk refused';
when others then
  raise notice 'FAIL  wrong error: % : %', sqlstate, sqlerrm;
end $$;

\echo '=== 7. The kiosk cannot read the hash at all ==='
-- Not "cannot read the column" — cannot see the row. The restrictive policy on
-- salons is what makes the SECURITY DEFINER RPC the only route to it.
select case when count(*) = 0 then 'PASS  no rows visible'
            else 'FAIL  ' || count(*) || ' salon rows visible to the kiosk' end as kiosk_sees
from public.salons;

\echo '=== 8. Five wrong tries lock that device out for five minutes ==='
reset role;
delete from public.kiosk_pin_attempts where device_key like 'test-%';
:as_manager
select public.set_kiosk_exit_pin('0042');
reset role;
:as_kiosk
do $$
declare i int; r text;
begin
  for i in 1..5 loop
    r := public.kiosk_verify_exit_pin('1111', 'test-lock') ->> 'result';
    raise notice '%  try % -> %', case when r = 'wrong' then 'PASS' else 'FAIL' end, i, r;
  end loop;

  r := public.kiosk_verify_exit_pin('1111', 'test-lock') ->> 'result';
  raise notice '%  sixth try -> %', case when r = 'locked_out' then 'PASS' else 'FAIL' end, r;

  -- The correct PIN is refused too. A lockout that the right PIN walks past is
  -- not a lockout, it is a delay for anybody who guesses correctly.
  r := public.kiosk_verify_exit_pin('0042', 'test-lock') ->> 'result';
  raise notice '%  correct PIN while locked -> %',
    case when r = 'locked_out' then 'PASS' else 'FAIL' end, r;

  -- Per device, not per salon: one jammed tablet must not lock the others.
  r := public.kiosk_verify_exit_pin('0042', 'test-other') ->> 'result';
  raise notice '%  another tablet -> %', case when r = 'ok' then 'PASS' else 'FAIL' end, r;
end $$;

\echo '=== 9. A success clears that device''s failures ==='
do $$
declare r text; n int;
begin
  perform public.kiosk_verify_exit_pin('1111', 'test-clear');
  perform public.kiosk_verify_exit_pin('1111', 'test-clear');
  r := public.kiosk_verify_exit_pin('0042', 'test-clear') ->> 'result';
  select count(*) into n from public.kiosk_pin_attempts
   where device_key = 'test-clear' and not succeeded;
  raise notice '%  correct after 2 wrong -> %, failures left = %',
    case when r = 'ok' and n = 0 then 'PASS' else 'FAIL' end, r, n;
end $$;

reset role;
delete from public.kiosk_pin_attempts where device_key like 'test-%';
\echo ''
\echo 'Done. Every line above should start with PASS.'
