-- ============================================================================
-- Theming: a salon-level default and a per-user override.
--
-- Two independent axes, stored separately because they answer different
-- questions:
--
--   theme  the palette and personality  — the salon's brand
--   mode   light or dark                — the room the device is standing in
--
-- Resolution at read time is: user override → salon default → 'midnight-plum'.
-- NULL on the profile means "no opinion, follow the salon", which is why the
-- user columns are nullable rather than defaulted.
--
-- Deliberately NOT an enum or a CHECK constraint on the theme name. Adding a
-- theme is meant to be one CSS block plus one entry in src/lib/theme.ts; a
-- database constraint would drag a migration into that and make the token
-- layer's promise false. The app validates against its own registry and falls
-- back to the default for anything it does not recognise, so an unknown value
-- degrades to a working screen rather than an error.
-- ============================================================================

alter table public.salons
  add column default_theme text not null default 'midnight-plum'
    check (char_length(default_theme) between 1 and 40);

comment on column public.salons.default_theme is
  'Theme shown on shared devices (the mounted front-desk tablet). Validated '
  'against the app''s theme registry, not by a database constraint.';

alter table public.profiles
  -- NULL = follow the salon default.
  add column theme text check (theme is null or char_length(theme) between 1 and 40),
  -- NULL = follow the operating system's prefers-color-scheme.
  add column mode text check (mode is null or mode in ('light', 'dark'));

comment on column public.profiles.theme is
  'Per-user theme override for their own device. NULL follows the salon.';
comment on column public.profiles.mode is
  'Per-user light/dark choice. NULL follows prefers-color-scheme.';

-- ----------------------------------------------------------------------------
-- A user sets their own appearance.
--
-- The existing "users can update their own name" policy already permits this,
-- but going through a function keeps the write shape in one place and lets the
-- caller clear an override by passing NULL without an UPDATE that looks like it
-- is touching unrelated columns.
-- ----------------------------------------------------------------------------
create or replace function public.set_appearance(
  p_theme text default null,
  p_mode  text default null
)
returns public.profiles
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  if p_mode is not null and p_mode not in ('light', 'dark') then
    raise exception 'Mode must be light or dark' using errcode = 'check_violation';
  end if;

  update public.profiles
     set theme = p_theme,
         mode  = p_mode
   where id = auth.uid()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.set_appearance(text, text) from public;
grant execute on function public.set_appearance(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- The owner sets the salon's default — what a shared device shows to anyone
-- who has not chosen for themselves.
-- ----------------------------------------------------------------------------
create or replace function public.set_salon_theme(p_theme text)
returns public.salons
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.salons;
begin
  if not public.is_manager() then
    raise exception 'Only a manager can change the salon theme'
      using errcode = 'insufficient_privilege';
  end if;

  if p_theme is null or char_length(trim(p_theme)) = 0 then
    raise exception 'Theme is required' using errcode = 'check_violation';
  end if;

  update public.salons
     set default_theme = p_theme
   where id = public.current_salon_id()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.set_salon_theme(text) from public;
grant execute on function public.set_salon_theme(text) to authenticated;

-- ============================================================================
-- One definition of "today".
--
-- Three different clocks decided what "today" meant: `current_date` and
-- `date_trunc('day', now())` in Postgres (UTC on Supabase) and a JS
-- `startOfToday()` in the app (the Node process's zone). They agree on a
-- server running UTC and disagree with the salon always.
--
-- The visible symptom: `turn_checkins.checkin_date` rolls over at UTC
-- midnight, which is 7pm Eastern / 4pm Pacific — the middle of the evening
-- shift. Techs silently drop off the rotation and `start_job` starts refusing
-- with "Check in for turns before taking a client" on a day they did check in,
-- while jobs they already finished still count toward "done today".
--
-- Fix: the salon owns its own clock, and every "today" is derived from it.
-- ============================================================================

alter table public.salons
  add column timezone text not null default 'UTC';

comment on column public.salons.timezone is
  'IANA zone name. Defines when the salon''s day starts for check-ins, '
  'rotation and daily totals.';

-- Reject a zone Postgres cannot resolve, rather than silently treating it as
-- UTC at read time.
create or replace function public.assert_valid_timezone()
returns trigger
language plpgsql
as $$
begin
  perform now() at time zone new.timezone;
  return new;
exception when others then
  raise exception 'Unknown timezone: %', new.timezone using errcode = 'check_violation';
end;
$$;

create trigger salons_timezone_valid
  before insert or update of timezone on public.salons
  for each row execute function public.assert_valid_timezone();

-- The salon's current local date.
create or replace function public.salon_today(p_salon_id uuid default null)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone coalesce(s.timezone, 'UTC'))::date
  from public.salons s
  where s.id = coalesce(p_salon_id, public.current_salon_id());
$$;

-- The instant that local date began, as a timestamptz — the lower bound for
-- every "today" query.
create or replace function public.salon_day_start(p_salon_id uuid default null)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select (date_trunc('day', now() at time zone coalesce(s.timezone, 'UTC'))
          at time zone coalesce(s.timezone, 'UTC'))
  from public.salons s
  where s.id = coalesce(p_salon_id, public.current_salon_id());
$$;

revoke all on function public.salon_today(uuid) from public;
revoke all on function public.salon_day_start(uuid) from public;
grant execute on function public.salon_today(uuid) to authenticated;
grant execute on function public.salon_day_start(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Check in / out, on the salon's clock.
--
-- Same behaviour as before; `current_date` becomes `salon_today()`. Existing
-- rows are untouched — `checkin_date` is still a plain date, it is just now
-- computed in the right zone.
-- ----------------------------------------------------------------------------
alter table public.turn_checkins
  alter column checkin_date set default public.salon_today();

create or replace function public.check_in_for_turns(p_tech_id uuid default null)
returns public.turn_checkins
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tech  uuid := coalesce(p_tech_id, auth.uid());
  v_salon uuid := public.current_salon_id();
  v_today date := public.salon_today();
  v_row   public.turn_checkins;
begin
  if v_tech is distinct from auth.uid() and not public.can_manage_floor() then
    raise exception 'Only the front desk can check someone else in'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_tech and salon_id = v_salon and is_active
  ) then
    raise exception 'That tech is not on this salon''s roster'
      using errcode = 'check_violation';
  end if;

  insert into public.turn_checkins (salon_id, tech_id, checkin_date, checked_in_by)
  values (v_salon, v_tech, v_today, auth.uid())
  on conflict (tech_id, checkin_date) do update
     set checked_out_at = null,
         checked_out_by = null,
         checked_in_at  = now(),
         checked_in_by  = auth.uid()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.check_out_of_turns(p_tech_id uuid default null)
returns public.turn_checkins
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tech uuid := coalesce(p_tech_id, auth.uid());
  v_row  public.turn_checkins;
begin
  if v_tech is distinct from auth.uid() and not public.can_manage_floor() then
    raise exception 'Only the front desk can check someone else out'
      using errcode = 'insufficient_privilege';
  end if;

  update public.turn_checkins
     set checked_out_at = now(),
         checked_out_by = auth.uid()
   where tech_id = v_tech
     and checkin_date = public.salon_today()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.check_in_for_turns(uuid) from public;
revoke all on function public.check_out_of_turns(uuid) from public;
grant execute on function public.check_in_for_turns(uuid) to authenticated;
grant execute on function public.check_out_of_turns(uuid) to authenticated;

-- `start_job` gated on `current_date`; on the salon's clock now, so a tech who
-- checked in this morning is still checked in at 8pm local.
create or replace function public.start_job(p_job_id uuid, p_tech_id uuid default null)
returns public.jobs
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_job    public.jobs;
  v_tech   uuid;
  v_skills public.skill[];
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job not found' using errcode = 'no_data_found';
  end if;

  if v_job.salon_id is distinct from public.current_salon_id() then
    raise exception 'Not authorized for this salon' using errcode = 'insufficient_privilege';
  end if;

  v_tech := coalesce(p_tech_id, v_job.tech_id, auth.uid());

  if v_tech is distinct from auth.uid() and not public.can_manage_floor() then
    raise exception 'Only the front desk can start a job for someone else'
      using errcode = 'insufficient_privilege';
  end if;

  if v_job.status <> 'waiting' then
    raise exception 'This client is already %', v_job.status using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.jobs
    where tech_id = v_tech and status = 'in_progress' and id <> p_job_id
  ) then
    raise exception 'That tech already has a client in progress' using errcode = 'unique_violation';
  end if;

  -- A tech has to be on today's rotation to take a client — "today" being the
  -- salon's day, not the database server's.
  if not exists (
    select 1 from public.turn_checkins
    where tech_id = v_tech
      and checkin_date = public.salon_today()
      and checked_out_at is null
  ) then
    raise exception 'Check in for turns before taking a client' using errcode = 'check_violation';
  end if;

  if cardinality(v_job.required_skills) > 0 then
    select skills into v_skills from public.profiles where id = v_tech;
    if not (coalesce(v_skills, '{}') @> v_job.required_skills) then
      raise exception 'That tech does not do this service' using errcode = 'check_violation';
    end if;
  end if;

  update public.jobs
     set tech_id    = v_tech,
         status     = 'in_progress',
         started_at = now()
   where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function public.start_job(uuid, uuid) from public;
grant execute on function public.start_job(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Today's numbers, from one place.
--
-- The dashboard used to count waiting / in progress / completed / booked with
-- four separate client-side queries, two of which defined "today" in the Node
-- process's timezone. This returns all of them on the salon's clock, so the
-- header line and the rotation board can no longer disagree.
--
-- `checked_in` is included precisely because "0 on rotation, 5 done today"
-- looked like corruption: the two now come from one query and one clock, so
-- when they differ it is a fact about the day rather than an artefact.
-- ----------------------------------------------------------------------------
create or replace function public.today_stats()
returns table (
  waiting            integer,
  in_progress        integer,
  completed_today    integer,
  appointments_today integer,
  checked_in         integer,
  on_shift           integer,
  day_start          timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with s as (select public.current_salon_id() as id),
       d as (select public.salon_day_start() as day_start)
  select
    (select count(*)::int from public.jobs j, s
      where j.salon_id = s.id and j.status = 'waiting'),
    (select count(*)::int from public.jobs j, s
      where j.salon_id = s.id and j.status = 'in_progress'),
    (select count(*)::int from public.jobs j, s, d
      where j.salon_id = s.id and j.status = 'completed' and j.completed_at >= d.day_start),
    (select count(*)::int from public.appointments a, s, d
      where a.salon_id = s.id and a.status = 'scheduled'
        and a.scheduled_at >= d.day_start
        and a.scheduled_at < d.day_start + interval '1 day'),
    (select count(*)::int from public.turn_checkins c, s
      where c.salon_id = s.id and c.checkin_date = public.salon_today()
        and c.checked_out_at is null),
    (select count(*)::int from public.shift_blocks b, s, d
      where b.salon_id = s.id and b.kind = 'shift'
        and b.starts_at < d.day_start + interval '1 day'
        and b.ends_at   > d.day_start),
    (select day_start from d);
$$;

revoke all on function public.today_stats() from public;
grant execute on function public.today_stats() to authenticated;

-- ----------------------------------------------------------------------------
-- The technician rail: one row per tech, everything the dashboard shows.
--
-- Assembled in SQL rather than by fanning out per-tech queries from the page,
-- so the rail is one round trip regardless of roster size.
-- ----------------------------------------------------------------------------
create or replace function public.floor_status()
returns table (
  tech_id        uuid,
  full_name      text,
  skills         public.skill[],
  is_checked_in  boolean,
  shift_start    timestamptz,
  shift_end      timestamptz,
  break_until    timestamptz,
  current_job_id uuid,
  current_client text,
  current_service text,
  started_at     timestamptz,
  expected_end   timestamptz,
  jobs_today     integer,
  earnings_today numeric,
  last_turn_at   timestamptz,
  queue_position integer
)
language sql
stable
security definer
set search_path = public
as $$
  with s as (select public.current_salon_id() as id),
       d as (select public.salon_day_start() as day_start),
       q as (select * from public.turn_queue())
  select
    p.id,
    p.full_name,
    p.skills,
    coalesce(q.is_checked_in, false),
    shift.starts_at,
    shift.ends_at,
    brk.ends_at,
    job.id,
    cust.name,
    job.service_name,
    job.started_at,
    -- Only an appointment carries a planned end; a walk-in has none, and
    -- inventing one would put a countdown on the screen that means nothing.
    appt.ends_at,
    coalesce(q.jobs_today, 0),
    coalesce(pay.total, 0)::numeric,
    p.last_turn_at,
    q.queue_position
  from public.profiles p
  cross join s
  cross join d
  left join q on q.tech_id = p.id
  left join lateral (
    select b.starts_at, b.ends_at
    from public.shift_blocks b
    where b.tech_id = p.id and b.kind = 'shift'
      and b.starts_at < d.day_start + interval '1 day'
      and b.ends_at   > d.day_start
    order by b.starts_at
    limit 1
  ) shift on true
  left join lateral (
    select b.ends_at
    from public.shift_blocks b
    where b.tech_id = p.id and b.kind in ('break', 'time_off')
      and now() >= b.starts_at and now() < b.ends_at
    limit 1
  ) brk on true
  left join lateral (
    select j.id, j.service_name, j.started_at, j.customer_id, j.appointment_id
    from public.jobs j
    where j.tech_id = p.id and j.status = 'in_progress'
    limit 1
  ) job on true
  left join public.customers cust on cust.id = job.customer_id
  left join lateral (
    select b.ends_at
    from public.schedule_blocks b
    where b.appointment_id = job.appointment_id
    limit 1
  ) appt on true
  left join lateral (
    select sum(pm.tech_amount) as total
    from public.payments pm
    where pm.tech_id = p.id and pm.created_at >= d.day_start
  ) pay on true
  where p.salon_id = s.id
    and p.role::text = 'tech'
    and p.is_active
  order by
    coalesce(q.is_checked_in, false) desc,
    q.queue_position nulls last,
    p.full_name;
$$;

revoke all on function public.floor_status() from public;
grant execute on function public.floor_status() to authenticated;
