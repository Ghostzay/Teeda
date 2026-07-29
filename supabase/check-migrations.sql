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
         to_regprocedure('public.service_log(date, uuid)') is not null)
) as t (step, file, applied)
order by step;
