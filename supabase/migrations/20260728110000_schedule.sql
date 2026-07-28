-- ============================================================================
-- Hourly schedule.
--
-- One table is the single source of truth for a tech's time: booked work,
-- breaks and unavailability all land here. Appointments write their own block
-- through a trigger, so the schedule can't drift from the booking.
--
-- The 5-minute buffer either side is maintained by the database, not by each
-- caller — set-up and clean-down are part of the booking, so every overlap
-- test and every rendered block gets the padding for free.
-- ============================================================================

create extension if not exists btree_gist;

create type public.block_kind as enum ('appointment', 'break', 'unavailable');

create table public.schedule_blocks (
  id             uuid primary key default gen_random_uuid(),
  salon_id       uuid not null references public.salons (id) on delete cascade,
  tech_id        uuid not null references public.profiles (id) on delete cascade,
  kind           public.block_kind not null default 'break',

  -- The service window as booked.
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  buffer_minutes integer not null default 5 check (buffer_minutes between 0 and 60),

  -- The window the tech is actually unavailable for. Maintained by a trigger
  -- rather than a generated column: `timestamptz - interval` is only STABLE
  -- (it can depend on the session timezone), which generated columns reject.
  blocked_from   timestamptz not null,
  blocked_to     timestamptz not null,

  appointment_id uuid references public.appointments (id) on delete cascade,
  title          text,
  note           text,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint schedule_blocks_ordered check (ends_at > starts_at)
);

-- One block per appointment, so re-saving a booking updates rather than dupes.
-- Not a partial index: ON CONFLICT can only target a partial index if every
-- caller repeats its predicate, and NULLs never conflict here anyway.
create unique index schedule_blocks_appointment_idx
  on public.schedule_blocks (appointment_id);

create index schedule_blocks_tech_day_idx on public.schedule_blocks (tech_id, starts_at);
create index schedule_blocks_salon_day_idx on public.schedule_blocks (salon_id, starts_at);

-- Nobody can be in two places at once — buffers included.
alter table public.schedule_blocks
  add constraint schedule_blocks_no_overlap
  exclude using gist (
    tech_id with =,
    tstzrange(blocked_from, blocked_to) with &&
  ) deferrable initially immediate;

/** Keeps the padded window in step with the service window and the buffer. */
create or replace function public.apply_schedule_buffer()
returns trigger
language plpgsql
as $$
begin
  new.blocked_from := new.starts_at - make_interval(mins => coalesce(new.buffer_minutes, 5));
  new.blocked_to   := new.ends_at   + make_interval(mins => coalesce(new.buffer_minutes, 5));
  return new;
end;
$$;

create trigger schedule_blocks_apply_buffer
  before insert or update on public.schedule_blocks
  for each row execute function public.apply_schedule_buffer();

create trigger schedule_blocks_touch_updated_at
  before update on public.schedule_blocks
  for each row execute function public.touch_updated_at();

alter table public.schedule_blocks enable row level security;

-- The schedule is a shared board: the floor sees everyone, a tech sees at
-- least their own. Reading someone else's booked hours is how the desk avoids
-- double-booking, so it isn't private.
create policy "salon members can view the schedule"
  on public.schedule_blocks for select
  to authenticated
  using (salon_id = public.current_salon_id());

create policy "techs block their own time, front desk blocks anyone's"
  on public.schedule_blocks for insert
  to authenticated
  with check (
    salon_id = public.current_salon_id()
    and (tech_id = auth.uid() or public.can_manage_floor())
  );

create policy "techs edit their own blocks, front desk edits any"
  on public.schedule_blocks for update
  to authenticated
  using (
    salon_id = public.current_salon_id()
    and (tech_id = auth.uid() or public.can_manage_floor())
  )
  with check (salon_id = public.current_salon_id());

create policy "techs remove their own blocks, front desk removes any"
  on public.schedule_blocks for delete
  to authenticated
  using (
    salon_id = public.current_salon_id()
    and (tech_id = auth.uid() or public.can_manage_floor())
  );

grant select, insert, update, delete on public.schedule_blocks to authenticated;

alter publication supabase_realtime add table public.schedule_blocks;

-- Opening hours frame the grid so it shows the working day, not 24 empty rows.
alter table public.salons
  add column open_hour  integer not null default 9  check (open_hour between 0 and 23),
  add column close_hour integer not null default 20 check (close_hour between 1 and 24),
  add constraint salons_hours_ordered check (close_hour > open_hour);

-- ----------------------------------------------------------------------------
-- Appointments keep their block in step.
-- ----------------------------------------------------------------------------
create or replace function public.sync_appointment_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minutes integer := 45;
  v_client  text;
begin
  -- No tech, or no longer live: there is nothing to hold.
  if tg_op = 'DELETE' or new.tech_id is null or new.status in ('cancelled', 'completed') then
    delete from public.schedule_blocks
    where appointment_id = coalesce(new.id, old.id);
    return coalesce(new, old);
  end if;

  if new.service_id is not null then
    select coalesce(duration_minutes, 45) into v_minutes
    from public.services where id = new.service_id;
  end if;

  select c.name into v_client from public.customers c where c.id = new.customer_id;

  insert into public.schedule_blocks (
    salon_id, tech_id, kind, starts_at, ends_at, appointment_id, title, created_by
  )
  values (
    new.salon_id,
    new.tech_id,
    'appointment',
    new.scheduled_at,
    new.scheduled_at + make_interval(mins => coalesce(v_minutes, 45)),
    new.id,
    coalesce(v_client, 'Client') || ' · ' || new.service_name,
    auth.uid()
  )
  on conflict (appointment_id) do update
    set tech_id   = excluded.tech_id,
        starts_at = excluded.starts_at,
        ends_at   = excluded.ends_at,
        title     = excluded.title;

  return new;
end;
$$;

create trigger appointments_sync_block
  after insert or update or delete on public.appointments
  for each row execute function public.sync_appointment_block();

-- ----------------------------------------------------------------------------
-- Backfill blocks for bookings that already exist.
--
-- Row by row, deliberately, because a single bulk INSERT cannot survive either
-- of the two things real booking data does here:
--
--   1. `ON CONFLICT DO NOTHING` with no conflict target makes Postgres consider
--      every unique and exclusion constraint on the table as a potential
--      arbiter — and `schedule_blocks_no_overlap` is DEFERRABLE, which is not
--      allowed as one. That is a hard error the moment the statement inserts
--      anything at all ("ON CONFLICT does not support deferrable unique
--      constraints/exclusion constraints as arbiters"), so it passes on an
--      empty database and fails on a real one.
--
--   2. This migration is what *introduces* the no-double-booking rule, so the
--      data predating it has never been checked against it. Two overlapping
--      appointments for one tech are entirely possible in an existing salon,
--      and a bulk insert would abort the whole migration over them.
--
-- Skipping the overlap is the right call: the appointment itself is untouched,
-- it simply does not get a calendar block until someone reschedules it. Losing
-- a block is recoverable; refusing to migrate is not.
-- ----------------------------------------------------------------------------
do $$
declare
  r         record;
  v_added   integer := 0;
  v_skipped integer := 0;
begin
  for r in
    select
      a.salon_id,
      a.tech_id,
      a.scheduled_at,
      a.scheduled_at + make_interval(mins => coalesce(s.duration_minutes, 45)) as ends_at,
      a.id as appointment_id,
      coalesce(c.name, 'Client') || ' · ' || a.service_name as title
    from public.appointments a
    left join public.services s on s.id = a.service_id
    left join public.customers c on c.id = a.customer_id
    where a.tech_id is not null
      and a.status not in ('cancelled', 'completed')
    -- Earliest first, so when two bookings overlap the one that was booked for
    -- the earlier slot keeps its block. Deterministic, and explicable.
    order by a.scheduled_at, a.id
  loop
    begin
      insert into public.schedule_blocks
        (salon_id, tech_id, kind, starts_at, ends_at, appointment_id, title)
      values
        (r.salon_id, r.tech_id, 'appointment', r.scheduled_at, r.ends_at,
         r.appointment_id, r.title);
      v_added := v_added + 1;
    exception
      when unique_violation then
        -- Already has a block. Nothing to do.
        v_skipped := v_skipped + 1;
      when exclusion_violation then
        v_skipped := v_skipped + 1;
        raise notice
          'Appointment % at % overlaps another booking for the same tech — no calendar block created. Reschedule it to give it one.',
          r.appointment_id, r.scheduled_at;
    end;
  end loop;

  raise notice 'Schedule backfill: % blocks created, % skipped.', v_added, v_skipped;
end $$;

-- ----------------------------------------------------------------------------
-- Booking a tech takes them out of the walk-in rotation for that window.
-- ----------------------------------------------------------------------------
create or replace function public.is_booked_now(p_tech_id uuid, p_at timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.schedule_blocks b
    where b.tech_id = p_tech_id
      and p_at >= b.blocked_from
      and p_at < b.blocked_to
  );
$$;

revoke all on function public.is_booked_now(uuid, timestamptz) from public;
grant execute on function public.is_booked_now(uuid, timestamptz) to authenticated;

drop function if exists public.turn_queue(uuid, public.skill[]);

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
  techs as (
    select p.id, p.full_name, p.last_turn_at, p.created_at, p.skills,
           exists (
             select 1 from public.turn_checkins c
             where c.tech_id = p.id
               and c.checkin_date = current_date
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
        where j.status = 'completed' and j.completed_at >= date_trunc('day', now())
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
          order by (is_busy or is_booked_now), last_turn_at asc nulls first, created_at asc
        ))::int
    end
  from scored
  order by
    is_checked_in desc,
    (is_busy or is_booked_now),
    last_turn_at asc nulls first,
    created_at asc;
$$;

drop function if exists public.suggest_next_tech(uuid, public.skill[], uuid);

create or replace function public.suggest_next_tech(
  p_salon_id        uuid default null,
  p_required_skills public.skill[] default null,
  p_exclude_tech_id uuid default null
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tech_id
  from public.turn_queue(p_salon_id, p_required_skills)
  where is_checked_in
    and not is_busy
    -- A tech inside an appointment window (buffer included) isn't free for a
    -- walk-in, even though they aren't mid-service yet.
    and not is_booked_now
    and has_skills
    and (p_exclude_tech_id is null or tech_id <> p_exclude_tech_id)
  order by queue_position
  limit 1;
$$;

revoke all on function public.turn_queue(uuid, public.skill[]) from public;
revoke all on function public.suggest_next_tech(uuid, public.skill[], uuid) from public;
grant execute on function public.turn_queue(uuid, public.skill[]) to authenticated;
grant execute on function public.suggest_next_tech(uuid, public.skill[], uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Blocking time out by hand.
-- ----------------------------------------------------------------------------
create or replace function public.block_time(
  p_tech_id  uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz,
  p_kind      text default 'break',
  p_title     text default null,
  p_buffer    integer default 5
)
returns public.schedule_blocks
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tech uuid := coalesce(p_tech_id, auth.uid());
  v_row  public.schedule_blocks;
begin
  if v_tech <> auth.uid() and not public.can_manage_floor() then
    raise exception 'Only the front desk can block someone else''s time'
      using errcode = 'insufficient_privilege';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'The end time must be after the start time' using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.profiles where id = v_tech and salon_id = public.current_salon_id()
  ) then
    raise exception 'That tech is not on this salon''s roster' using errcode = 'no_data_found';
  end if;

  begin
    insert into public.schedule_blocks (
      salon_id, tech_id, kind, starts_at, ends_at, buffer_minutes, title, created_by
    )
    values (
      public.current_salon_id(), v_tech,
      coalesce(nullif(p_kind, ''), 'break')::public.block_kind,
      p_starts_at, p_ends_at, coalesce(p_buffer, 5),
      nullif(trim(coalesce(p_title, '')), ''), auth.uid()
    )
    returning * into v_row;
  exception when exclusion_violation then
    raise exception 'That overlaps something already on their schedule'
      using errcode = 'unique_violation';
  end;

  return v_row;
end;
$$;

create or replace function public.unblock_time(p_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_block public.schedule_blocks;
  v_count integer;
begin
  select * into v_block from public.schedule_blocks where id = p_id;
  if not found then
    return 0;
  end if;

  if v_block.tech_id <> auth.uid() and not public.can_manage_floor() then
    raise exception 'Only the front desk can clear someone else''s time'
      using errcode = 'insufficient_privilege';
  end if;

  if v_block.appointment_id is not null then
    raise exception 'Cancel the appointment to free this slot' using errcode = 'check_violation';
  end if;

  delete from public.schedule_blocks where id = p_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.block_time(uuid, timestamptz, timestamptz, text, text, integer) from public;
revoke all on function public.unblock_time(uuid) from public;
grant execute on function public.block_time(uuid, timestamptz, timestamptz, text, text, integer) to authenticated;
grant execute on function public.unblock_time(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Reading the schedule.
--
-- Returns blocks in a window with the tech's name attached, so the grid needs
-- one query rather than one per column.
-- ----------------------------------------------------------------------------
create or replace function public.schedule_for_range(
  p_from    timestamptz,
  p_to      timestamptz,
  p_tech_id uuid default null
)
returns table (
  id             uuid,
  tech_id        uuid,
  tech_name      text,
  kind           public.block_kind,
  starts_at      timestamptz,
  ends_at        timestamptz,
  blocked_from   timestamptz,
  blocked_to     timestamptz,
  buffer_minutes integer,
  title          text,
  appointment_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id, b.tech_id, p.full_name, b.kind,
    b.starts_at, b.ends_at, b.blocked_from, b.blocked_to, b.buffer_minutes,
    b.title, b.appointment_id
  from public.schedule_blocks b
  join public.profiles p on p.id = b.tech_id
  where b.salon_id = public.current_salon_id()
    and b.starts_at < p_to
    and b.ends_at   > p_from
    and (p_tech_id is null or b.tech_id = p_tech_id)
  order by b.starts_at, p.full_name;
$$;

revoke all on function public.schedule_for_range(timestamptz, timestamptz, uuid) from public;
grant execute on function public.schedule_for_range(timestamptz, timestamptz, uuid) to authenticated;
