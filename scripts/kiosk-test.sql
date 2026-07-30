\set ON_ERROR_STOP on
\pset pager off
set client_min_messages to notice;
create or replace function public.act_as(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub',p)::text, false); end $$;

insert into auth.users (id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','owner@p.com','{"full_name":"Alex","salon_name":"Polished"}');
\set salon '(select salon_id from public.profiles where id = ''11111111-1111-1111-1111-111111111111'')'
insert into auth.users (id,email,raw_user_meta_data) values
 ('cccccccc-0000-0000-0000-000000000001','mai@p.com', json_build_object('full_name','Mai','salon_id',:salon,'role','tech')::jsonb);
update public.profiles set skills='{manicure,pedicure,gel,nail_art}' where full_name='Mai';
update public.salons set timezone='America/New_York';

-- The device's auth user. In the app this is made with the service-role key.
insert into auth.users (id,email) values ('dddddddd-0000-0000-0000-00000000000d','kiosk-1@device.local');

select public.act_as('11111111-1111-1111-1111-111111111111');
set role authenticated;

select public.check_in_for_turns((select id from public.profiles where full_name='Mai'));

insert into public.customers (salon_id, name, phone) values
 (public.current_salon_id(), 'Rosa Diaz',    '(555) 210-4477'),
 (public.current_salon_id(), 'Amy Santiago', '5552109988');

select id as rosa from public.customers where name='Rosa Diaz' \gset
select id as mai  from public.profiles  where full_name='Mai' \gset
select id as gel  from public.services  where name='Gel manicure' \gset

-- One appointment, right now, so it is inside the check-in window.
select (public.book_appointment(:'rosa'::uuid, now() + interval '5 minutes',
  array[:'gel']::uuid[], null, :'mai'::uuid, null)).id as appt \gset

\echo '=== 1. Register the device ==='
select label, is_active from public.register_kiosk_device(
  'dddddddd-0000-0000-0000-00000000000d', 'Front desk iPad');
select public.set_kiosk_exit_pin('4821');
reset role;

-- ===========================================================================
\echo ''
\echo '=== 2. RAW SELECTS AS THE KIOSK — every one must return nothing ==='
select public.act_as('dddddddd-0000-0000-0000-00000000000d');
set role authenticated;

select 'customers'            as t, count(*) from public.customers
union all select 'appointments',   count(*) from public.appointments
union all select 'profiles',       count(*) from public.profiles
union all select 'salons',         count(*) from public.salons
union all select 'jobs',           count(*) from public.jobs
union all select 'payments',       count(*) from public.payments
union all select 'services',       count(*) from public.services
union all select 'tech_pay',       count(*) from public.tech_pay
union all select 'shift_blocks',   count(*) from public.shift_blocks
union all select 'turn_checkins',  count(*) from public.turn_checkins
order by 1;

\echo '--- and writes are refused too ---'
do $$ begin
  insert into public.customers (salon_id, name) values (public.current_salon_id(),'Injected');
  raise notice 'UNEXPECTED: kiosk inserted a customer';
exception when insufficient_privilege or check_violation then raise notice 'blocked: %', sqlerrm;
end $$;
select count(*) as customers_named_injected from public.customers where name='Injected';

\echo '--- the salon-wide helpers give it nothing either ---'
select public.is_manager() as is_manager, public.can_manage_floor() as can_manage_floor,
       public.is_kiosk() as is_kiosk, public.kiosk_salon_id() is not null as has_device;

-- ===========================================================================
\echo ''
\echo '=== 3. The RPCs are the only way through ==='
select jsonb_pretty(public.kiosk_context()) as context;

\echo '--- a full 10-digit match, formatted differently to how it is stored ---'
select jsonb_pretty(public.kiosk_lookup_client('555-210-4477')) as found;

\echo '=== 4. A wrong number and a partial reveal exactly the same thing ==='
select 'wrong 10-digit' as probe, public.kiosk_lookup_client('5559999999') as answer
union all select 'partial (real prefix)', public.kiosk_lookup_client('555210')
union all select 'name-ish',              public.kiosk_lookup_client('Rosa')
union all select 'empty',                 public.kiosk_lookup_client('');

\echo '=== 5. Rate limit: 8 a minute, then blocked ==='
do $$
declare i int; r jsonb;
begin
  -- Two lookups already spent above (the found one and the wrong one); the
  -- partials returned before recording, so they do not count.
  for i in 1..10 loop
    r := public.kiosk_lookup_client('555000' || lpad(i::text, 4, '0'));
  end loop;
  raise notice 'after burst: %', r->>'result';
end $$;
\echo '--- the kiosk cannot read its own audit trail; the manager can ---'
select count(*) as rows_kiosk_can_see from public.kiosk_lookups;
reset role;
select public.act_as('11111111-1111-1111-1111-111111111111');
set role authenticated;
select count(*) as rows_manager_sees, count(*) filter (where matched) as matches
from public.kiosk_lookups;

\echo ''
\echo '=== 6. Check-in: the happy path, through the same RPC the desk uses ==='
reset role;
select public.act_as('dddddddd-0000-0000-0000-00000000000d');
set role authenticated;
\echo '--- first: the device cannot rub out its own ledger ---'
update public.kiosk_lookups set looked_at = looked_at - interval '2 minutes';
\echo '(0 rows above = the kiosk has no UPDATE path to the rate-limit table)'
-- So age it as the table owner, which is what the passage of time would do.
reset role;
update public.kiosk_lookups set looked_at = looked_at - interval '2 minutes';
select public.act_as('dddddddd-0000-0000-0000-00000000000d');
set role authenticated;
select jsonb_pretty(public.kiosk_checkin(:'appt'::uuid)) as checked_in;

\echo '--- checking in twice is refused, not double-booked ---'
select public.kiosk_checkin(:'appt'::uuid)->>'result' as second_attempt;

\echo '--- and the lookup now says so ---'
select public.kiosk_lookup_client('5552104477')->>'state' as state_after_checkin;

\echo '--- a booking id from thin air reveals nothing ---'
select public.kiosk_checkin('00000000-0000-0000-0000-000000000000')->>'result' as bogus_id;

\echo ''
\echo '=== 7. The check-in landed in the queue the tech screen already reads ==='
reset role;
select public.act_as('11111111-1111-1111-1111-111111111111');
set role authenticated;
select j.status, j.type, c.name as client, p.full_name as tech
from public.jobs j
join public.customers c on c.id = j.customer_id
left join public.profiles p on p.id = j.tech_id;
select status as appointment_status from public.appointments;
select count(*) as on_day_calendar
from jsonb_array_elements(public.day_calendar(public.salon_today())->'appointments');

\echo ''
\echo '=== 8. Outside the window ==='
-- Push the booking two hours out; 30 min early is the configured limit.
update public.appointments set status='scheduled', scheduled_at = now() + interval '2 hours';
delete from public.jobs;
reset role;
select public.act_as('dddddddd-0000-0000-0000-00000000000d');
set role authenticated;
reset role;
update public.kiosk_lookups set looked_at = looked_at - interval '2 minutes';
select public.act_as('dddddddd-0000-0000-0000-00000000000d');
set role authenticated;
select public.kiosk_lookup_client('5552104477')->>'state' as state_when_early;
select public.kiosk_checkin(:'appt'::uuid)->>'result' as checkin_when_early;

\echo ''
\echo '=== 9. The exit PIN is checked in SQL, never sent to the device ==='
reset role;
update public.kiosk_lookups set looked_at = looked_at - interval '2 minutes';
select public.act_as('dddddddd-0000-0000-0000-00000000000d');
set role authenticated;
select public.kiosk_check_exit_pin('0000') as wrong_pin,
       public.kiosk_check_exit_pin('4821') as right_pin;

\echo ''
\echo '=== 10. A revoked device goes dark immediately ==='
reset role;
select public.act_as('11111111-1111-1111-1111-111111111111');
set role authenticated;
update public.kiosk_devices set is_active = false where label = 'Front desk iPad';
reset role;
select public.act_as('dddddddd-0000-0000-0000-00000000000d');
set role authenticated;
select public.kiosk_context() is null as context_gone;
do $$ begin
  perform public.kiosk_lookup_client('5552104477');
  raise notice 'UNEXPECTED: a revoked device still looked someone up';
exception when insufficient_privilege then raise notice 'blocked: %', sqlerrm; end $$;
reset role;
\echo '=== DONE ==='
