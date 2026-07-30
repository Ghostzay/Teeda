\set ON_ERROR_STOP on
\pset pager off
set client_min_messages to notice;
create or replace function public.act_as(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub',p)::text, false); end $$;

insert into auth.users (id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','owner@p.com','{"full_name":"Alex","salon_name":"Polished"}');
\set salon '(select salon_id from public.profiles where id = ''11111111-1111-1111-1111-111111111111'')'
insert into auth.users (id,email,raw_user_meta_data) values
 ('cccccccc-0000-0000-0000-000000000001','mai@p.com', json_build_object('full_name','Mai','salon_id',:salon,'role','tech')::jsonb),
 ('cccccccc-0000-0000-0000-000000000002','kim@p.com', json_build_object('full_name','Kim','salon_id',:salon,'role','tech')::jsonb),
 ('cccccccc-0000-0000-0000-000000000003','uyen@p.com',json_build_object('full_name','Uyen','salon_id',:salon,'role','tech')::jsonb);
insert into auth.users (id,email) values ('dddddddd-0000-0000-0000-00000000000d','kiosk@device.local');

update public.profiles set skills='{manicure,pedicure,gel,nail_art}' where full_name='Mai';
update public.profiles set skills='{manicure}'                      where full_name='Kim';
update public.profiles set skills='{manicure,pedicure,gel,nail_art}' where full_name='Uyen';
update public.salons set timezone='UTC', open_hour=0, close_hour=24;

select public.act_as('11111111-1111-1111-1111-111111111111');
set role authenticated;
select label from public.register_kiosk_device('dddddddd-0000-0000-0000-00000000000d','iPad');

select id as mai from public.profiles where full_name='Mai' \gset
select id as kim from public.profiles where full_name='Kim' \gset
select id as uyen from public.profiles where full_name='Uyen' \gset

-- Mai and Kim on shift today 10:00-16:00. Uyen NOT on shift.
-- Relative to now, so the test is not hostage to what time it is run. Anchored
-- to the hour so the printed slots are readable.
\set shift_start '(date_trunc(''hour'', now()) + interval ''1 hour'')'
insert into public.shift_blocks (salon_id, tech_id, kind, starts_at, ends_at)
select public.current_salon_id(), t, 'shift', :shift_start, :shift_start + interval '6 hours'
from unnest(array[:'mai'::uuid, :'kim'::uuid]) t;
-- Mai takes a half-hour break two hours in.
insert into public.shift_blocks (salon_id, tech_id, kind, starts_at, ends_at)
values (public.current_salon_id(), :'mai'::uuid, 'break',
        :shift_start + interval '2 hours', :shift_start + interval '2 hours 30 minutes');

select id as gel  from public.services where name='Gel manicure' \gset
select id as mani from public.services where name='Manicure' \gset
select id as pedi from public.services where name='Pedicure' \gset
select id as art  from public.services where name='Nail art (per nail)' \gset
reset role;

-- ==========================================================================
select public.act_as('dddddddd-0000-0000-0000-00000000000d');
set role authenticated;

\echo '=== 1. The menu comes from the table, active only ==='
select count(*) as active_services from public.kiosk_service_menu();
reset role;
select public.act_as('11111111-1111-1111-1111-111111111111'); set role authenticated;
update public.services set is_active=false where name='Polish change';
reset role;
select public.act_as('dddddddd-0000-0000-0000-00000000000d'); set role authenticated;
select count(*) as after_deactivating_one from public.kiosk_service_menu();
select count(*) as polish_change_visible from public.kiosk_service_menu() where name='Polish change';

\echo '=== 2. Exclusivity: one per category, add-ons unlimited ==='
select public.services_basket_is_valid(array[:'gel',:'pedi',:'art']::uuid[]) as gel_pedi_art,
       public.services_basket_is_valid(array[:'gel',:'mani']::uuid[])        as two_manicures,
       public.services_total_minutes(array[:'gel',:'pedi',:'art']::uuid[])   as total_minutes;

\echo '=== 3. A tech not on shift never appears ==='
select full_name, next_opening, openings
from public.kiosk_available_techs(array[:'gel']::uuid[]);
\echo '--- Uyen has the skills but no shift, so she is absent. Kim lacks gel. ---'

\echo '=== 4. Slots respect the shift window and the lunch break ==='
select to_char(slot_at, 'HH24:MI') as slot, tech_name
from public.kiosk_available_slots(array[:'gel']::uuid[], :'mai'::uuid)
order by slot_at limit 30;

\echo ''
\echo '=== 5. Registering a new client ==='
select public.kiosk_register_client('Rosa','Diaz','(555) 210-4477','vi','Acetone') as new_id \gset
select first_name, last_name, name, phone, language, allergies
from public.customers where id = :'new_id'::uuid;
\echo '--- the same number again returns the same client, not a duplicate ---'
select public.kiosk_register_client('Rosa','D','5552104477') = :'new_id'::uuid as same_client;
select count(*) as customer_rows from public.customers;

\echo ''
\echo '=== 6. Book it ==='
select slot_at as slot from public.kiosk_available_slots(array[:'gel',:'art']::uuid[], :'mai'::uuid)
order by slot_at limit 1 \gset
select jsonb_pretty(public.kiosk_book(:'new_id'::uuid, array[:'gel',:'art']::uuid[], :'mai'::uuid, :'slot'::timestamptz)) as booked;

\echo '--- that slot is gone, and so are the ones it overlaps ---'
select count(*) as slots_at_that_time
from public.kiosk_available_slots(array[:'gel',:'art']::uuid[], :'mai'::uuid)
where slot_at = :'slot'::timestamptz;

\echo '--- the block held matches the WHOLE basket, not just the first service ---'
select extract(epoch from (b.ends_at - b.starts_at))/60 as block_minutes,
       public.appointment_minutes(b.appointment_id) as basket_minutes
from public.schedule_blocks b where b.appointment_id is not null;

\echo '--- booking the same slot again loses cleanly ---'
select public.kiosk_book(:'new_id'::uuid, array[:'gel',:'art']::uuid[], :'mai'::uuid, :'slot'::timestamptz)->>'result' as second_attempt;

\echo ''
\echo '=== 7. The booking is an ordinary appointment ==='
reset role;
select public.act_as('11111111-1111-1111-1111-111111111111'); set role authenticated;
select a.status, a.service_name, p.full_name as tech,
       (select count(*) from public.appointment_services x where x.appointment_id=a.id) as basket_lines
from public.appointments a join public.profiles p on p.id=a.tech_id;
\echo '--- and it is on the day calendar ---'
select jsonb_array_length(public.day_calendar(public.salon_today())->'appointments') as on_calendar,
       (public.day_calendar(public.salon_today())->'appointments'->0->>'duration_min') as calendar_minutes;

\echo ''
\echo '=== 8. The kiosk can create a booking and nothing else ==='
reset role;
select public.act_as('dddddddd-0000-0000-0000-00000000000d'); set role authenticated;
select id as appt from public.appointments limit 1;
do $$
declare v_id uuid;
begin
  select id into v_id from public.appointments;  -- RLS: kiosk sees none
  if v_id is null then raise notice 'kiosk cannot even see the appointment it just made'; end if;
end $$;
do $$ begin
  update public.appointments set status='cancelled';
  raise notice 'rows updated: %', (select count(*) from public.appointments where status='cancelled');
end $$;
do $$ begin
  delete from public.appointments;
end $$;
reset role;
select public.act_as('11111111-1111-1111-1111-111111111111'); set role authenticated;
select count(*) as appointments_still_there, count(*) filter (where status='scheduled') as still_scheduled
from public.appointments;
reset role;
\echo '=== DONE ==='
