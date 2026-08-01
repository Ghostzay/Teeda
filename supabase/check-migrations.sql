-- Which migrations has this database actually got?
--
-- Paste this whole file into the Supabase SQL editor and run it. It only
-- reads, so it is safe to run at any time and as often as you like.
--
-- Each row checks for something a migration creates. "MISSING" means that file
-- has not been applied — or was applied and silently rolled back, which is what
-- the SQL editor does to an entire file when any single statement in it fails.

select
  step,
  file,
  case when applied then 'ok' else 'MISSING' end as status
from (
  values
    (1,  '20260728000000_init.sql',
         to_regclass('public.profiles') is not null),
    (2,  '20260728010000_bootstrap_salon.sql',
         to_regprocedure('public.bootstrap_salon(text, text)') is not null),
    (3,  '20260728020000_add_admin_role.sql',
         'admin' = any (enum_range(null::public.user_role)::text[])),
    (4,  '20260728030000_admin_permissions.sql',
         to_regprocedure('public.can_manage_floor()') is not null),
    (5,  '20260728040000_payments.sql',
         to_regclass('public.payments') is not null),
    (6,  '20260728050000_services_and_skills.sql',
         to_regclass('public.services') is not null),
    (7,  '20260728060000_daily_checkins.sql',
         to_regclass('public.turn_checkins') is not null),
    (8,  '20260728070000_splits_and_earnings.sql',
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'payments'
                   and column_name = 'tech_amount')),
    (9,  '20260728080000_notifications.sql',
         to_regclass('public.notifications') is not null),
    (10, '20260728090000_add_super_admin_role.sql',
         'super_admin' = any (enum_range(null::public.user_role)::text[])),
    (11, '20260728100000_commission_and_super_admin.sql',
         to_regclass('public.tech_pay') is not null),
    (12, '20260728110000_schedule.sql',
         to_regclass('public.schedule_blocks') is not null),
    (13, '20260728120000_shift_blocks.sql',
         to_regclass('public.shift_blocks') is not null),
    (14, '20260728130000_theming.sql',
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'salons'
                   and column_name = 'timezone')),
    (15, '20260728140000_availability.sql',
         to_regprocedure('public.month_availability(date, date)') is not null),
    (16, '20260728150000_recurring_availability.sql',
         to_regclass('public.availability_patterns') is not null),
    (17, '20260728160000_dashboard_layout.sql',
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles'
                   and column_name = 'dashboard_layout')),
    (18, '20260728170000_appointments_and_log.sql',
         to_regprocedure('public.service_log(date, uuid)') is not null),
    (19, '20260728180000_profiles_and_history.sql',
         to_regclass('public.tech_profiles') is not null),
    (20, '20260728190000_service_catalogue.sql',
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'services'
                   and column_name = 'category')),
    (21, '20260728200000_multi_service.sql',
         to_regclass('public.appointment_services') is not null),
    (22, '20260728210000_day_calendar.sql',
         to_regprocedure('public.day_calendar(date, uuid)') is not null),
    (23, '20260728220000_add_kiosk_role.sql',
         'kiosk' = any (enum_range(null::public.user_role)::text[])),
    (24, '20260728230000_kiosk.sql',
         to_regclass('public.kiosk_devices') is not null),
    (25, '20260728240000_kiosk_booking.sql',
         to_regprocedure('public.kiosk_available_slots(uuid[], uuid, date)') is not null),
    (26, '20260728250000_client_search.sql',
         to_regprocedure('public.staff_search_clients(text, integer)') is not null),
    (27, '20260728260000_rotation_salon_clock.sql',
         -- The fix lives inside a function body, so this checks for what the
         -- new one calls rather than for the absence of the old one — the
         -- migration explains the bug in a comment, and that comment contains
         -- the very string an absence-check would look for.
         pg_get_functiondef(to_regprocedure('public.turn_queue(uuid, public.skill[])'))
           ~ 'salon_today'),
    (28, '20260728270000_kiosk_accounts.sql',
         to_regprocedure('public.kiosk_account()') is not null),
    (29, '20260728280000_kiosk_mode.sql',
         to_regclass('public.kiosk_pin_attempts') is not null)
) as t (step, file, applied)
order by step;
