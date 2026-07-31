-- ============================================================================
-- The rotation empties every evening.
--
-- Reproduced, 9:34pm on a Tuesday in New York — a perfectly ordinary moment to
-- be checking someone in:
--
--   now() UTC          2026-07-31 01:34
--   now() in the salon 2026-07-30 21:34
--   current_date       2026-07-31        <- Postgres, in UTC
--   salon_today()      2026-07-30        <- the salon's actual day
--
--   check_in_for_turns writes checkin_date = 2026-07-30   (the salon's day)
--   turn_queue looks   for  checkin_date = current_date   (UTC's day)
--
--   -> is_checked_in    false
--   -> queue_position   null
--   -> suggest_next_tech NOBODY
--
-- So a tech taps "check in", the board does not change, and they tap it again.
-- The write was never lost — it was filed under the right date and read back
-- under the wrong one. On a US salon this is every evening after 8pm; on a
-- UTC+ salon it is every morning before opening.
--
-- `salon_today()` and `salon_day_start()` already exist and already do this
-- correctly. `today_stats()` was converted to them when this class of bug was
-- first found; `turn_queue` and `am_i_checked_in` were missed, which is why
-- the counters agreed and the board did not.
--
-- Read-only change to two functions. No table, column or policy is touched.
-- ============================================================================

create or replace function public.turn_queue(
  p_salon_id        uuid default null,
  p_required_skills public.skill[] default null
)
returns table (
  tech_id        uuid,
  full_name      text,
  last_turn_at   timestamptz,
  is_busy        boolean,
  is_checked_in  boolean,
  is_booked_now  boolean,
  has_skills     boolean,
  skills         public.skill[],
  waiting_jobs   integer,
  jobs_today     integer,
  queue_position integer
)
language sql
stable
security definer
set search_path = public
as $$
  with salon as (
    select coalesce(p_salon_id, public.current_salon_id()) as id
  ),
  clock as (
    -- Resolved once, from the salon's timezone, and used for every "today"
    -- below. Two different notions of today in one query is how the board and
    -- the counters came to disagree in the first place.
    select public.salon_today((select id from salon))     as today,
           public.salon_day_start((select id from salon)) as day_start
  ),
  techs as (
    select p.id, p.full_name, p.last_turn_at, p.created_at, p.skills,
           exists (
             select 1 from public.turn_checkins c, clock k
             where c.tech_id = p.id
               -- Was `current_date`, which is UTC. `check_in_for_turns` has
               -- always written the salon's date, so the two only matched
               -- during the hours the salon's date happened to equal UTC's.
               and c.checkin_date = k.today
               and c.checked_out_at is null
           ) as is_checked_in,
           exists (
             select 1 from public.schedule_blocks b
             where b.tech_id = p.id
               and now() >= b.blocked_from
               and now() <  b.blocked_to
           ) as is_booked_now
    from public.profiles p, salon s
    where p.salon_id = s.id
      and p.role::text = 'tech'
      and p.is_active
      and s.id = public.current_salon_id()
  ),
  stats as (
    select
      t.id,
      count(*) filter (where j.status = 'in_progress') > 0 as is_busy,
      count(*) filter (where j.status = 'waiting')::int as waiting_jobs,
      count(*) filter (
        -- Same fix: this counted from UTC midnight, so a tech's "done today"
        -- reset four hours before their day did.
        where j.status = 'completed' and j.completed_at >= (select day_start from clock)
      )::int as jobs_today
    from techs t
    left join public.jobs j on j.tech_id = t.id
    group by t.id
  ),
  scored as (
    select
      t.id, t.full_name, t.last_turn_at, t.created_at, t.skills,
      t.is_checked_in, t.is_booked_now,
      coalesce(s.is_busy, false) as is_busy,
      coalesce(s.waiting_jobs, 0) as waiting_jobs,
      coalesce(s.jobs_today, 0) as jobs_today,
      (p_required_skills is null
        or cardinality(p_required_skills) = 0
        or t.skills @> p_required_skills) as has_skills
    from techs t
    left join stats s on s.id = t.id
  )
  select
    id, full_name, last_turn_at, is_busy, is_checked_in, is_booked_now,
    has_skills, skills, waiting_jobs, jobs_today,
    case
      when is_checked_in then
        (row_number() over (
          partition by is_checked_in
          order by
            -- Never had a turn goes first, then longest since their last one.
            last_turn_at asc nulls first,
            created_at asc
        ))::int
      else null
    end
  from scored
  order by
    is_checked_in desc,
    last_turn_at asc nulls first,
    created_at asc;
$$;

revoke all on function public.turn_queue(uuid, public.skill[]) from public;
grant execute on function public.turn_queue(uuid, public.skill[]) to authenticated;

-- ----------------------------------------------------------------------------
-- The tech's own screen had the same bug, which is what made it confusing
-- rather than merely wrong: they tapped "check in", their own screen still
-- said they were not checked in, so they tapped it again.
-- ----------------------------------------------------------------------------
create or replace function public.am_i_checked_in()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.turn_checkins
    where tech_id = auth.uid()
      and checkin_date = public.salon_today()
      and checked_out_at is null
  );
$$;

revoke all on function public.am_i_checked_in() from public;
grant execute on function public.am_i_checked_in() to authenticated;
