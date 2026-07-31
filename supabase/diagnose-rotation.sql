-- Why isn't my tech showing up on the rotation?
--
-- Paste this whole file into the Supabase SQL editor and run it. It only
-- reads, so it is safe at any time.
--
-- It answers one question: does this database read check-ins on the salon's
-- clock, or on UTC's? Those two dates differ for a few hours every day, and
-- during those hours a tech checks in and the board stays empty.
--
-- Note: this reads the salon's timezone straight from `salons` rather than
-- calling salon_today(), because the SQL editor has no signed-in user and
-- salon_today() would just return blank there.

with s as (select id, timezone from public.salons order by created_at limit 1),
d as (
  select
    (now() at time zone s.timezone)::date as salon_date,
    current_date                          as utc_date,
    to_char(now() at time zone s.timezone, 'YYYY-MM-DD HH24:MI') as salon_clock
  from s
)
select 'salon time now'   as what, d.salon_clock          as value from d
union all select 'salon date',      d.salon_date::text          from d
union all select 'UTC date',        d.utc_date::text            from d
union all select 'do they agree?',
  case when d.salon_date = d.utc_date
       then 'yes - the bug is invisible right now; try again this evening'
       else 'NO  - a tech checking in right now will not appear' end from d
union all select 'turn_queue reads',
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'turn_queue'
      and pg_get_functiondef(p.oid) ~ 'salon_today')
  then 'the salon clock  (fix 20260728260000 IS applied)'
  else 'UTC              (fix 20260728260000 is NOT applied)' end;

-- Who checked in recently, and whether the board can see them.
with s as (select id, timezone from public.salons order by created_at limit 1)
select
  pr.full_name,
  c.checkin_date                                  as checked_in_for,
  c.checked_out_at is null                        as still_on,
  c.checkin_date = (now() at time zone s.timezone)::date as board_sees_them_after_fix,
  c.checkin_date = current_date                   as board_sees_them_before_fix
from public.turn_checkins c
join public.profiles pr on pr.id = c.tech_id
cross join s
where c.checkin_date >= (now() at time zone s.timezone)::date - 2
order by c.checkin_date desc, pr.full_name;
