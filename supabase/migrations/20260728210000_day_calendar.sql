-- ============================================================================
-- One day, every working tech, in one query.
--
-- The old day board asked for a schedule overlay and then worked everything out
-- in the browser: which techs to show, how long each booking runs, where the
-- day starts. That is three different places to get a timezone wrong.
--
-- This returns a single JSON document with every number already resolved into
-- *salon-local minutes from midnight*. The client does arithmetic on integers
-- and never touches a timezone again — which is the whole point, because
-- minutes-from-local-midnight is DST-proof by construction: an appointment
-- booked for 9am is 540 on a spring-forward day exactly as it is on any other,
-- even though the UTC instant moved by an hour.
--
-- Read-only. No table is changed, no column is added.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- How long a booking runs.
--
-- `appointments` has a start and no end — the duration lives on the services.
-- A visit is the sum of its basket, because one tech does the whole thing back
-- to back. Anything off-menu, or on-menu with no minutes recorded, falls back
-- to a nominal slot so the block is still visible and still tappable rather
-- than collapsing to zero height.
-- ----------------------------------------------------------------------------
create or replace function public.appointment_minutes(p_appointment_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- The basket, when there is one. `nullif` on the sum matters: a basket of
    -- services that all have no minutes recorded is no more informative than
    -- no basket at all, so it falls through rather than rendering as zero.
    nullif((select sum(coalesce(s.duration_minutes, 0))
              from public.appointment_services a
              join public.services s on s.id = a.service_id
             where a.appointment_id = p_appointment_id), 0),
    -- Otherwise the single service the booking points at.
    (select s.duration_minutes
       from public.appointments ap
       join public.services s on s.id = ap.service_id
      where ap.id = p_appointment_id),
    -- Off-menu, or on-menu with no minutes: a nominal appointment. Never zero,
    -- because a zero-height block cannot be seen or tapped.
    45
  )::integer;
$$;

revoke all on function public.appointment_minutes(uuid) from public;
grant execute on function public.appointment_minutes(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- The day.
--
-- `p_tech_id` narrows to one column for a tech looking at their own day. Null
-- means every tech, which is what a manager gets.
-- ----------------------------------------------------------------------------
create or replace function public.day_calendar(
  p_day     date,
  p_tech_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon  public.salons;
  v_start  timestamptz;
  v_end    timestamptz;
  v_result jsonb;
begin
  select * into v_salon from public.salons where id = public.current_salon_id();
  if not found then
    raise exception 'No salon for this account' using errcode = 'no_data_found';
  end if;

  select b.starts_at, b.ends_at into v_start, v_end
  from public.salon_day_bounds(p_day) b;

  with
  -- Local minutes from midnight. Doing this once, here, is what keeps the rest
  -- of the stack free of timezone arithmetic.
  bands as (
    select
      sb.tech_id,
      sb.kind::text as kind,
      sb.note,
      extract(epoch from (
        (sb.starts_at at time zone v_salon.timezone)
        - date_trunc('day', v_start at time zone v_salon.timezone)
      ))::numeric / 60 as start_min,
      extract(epoch from (
        (sb.ends_at at time zone v_salon.timezone)
        - date_trunc('day', v_start at time zone v_salon.timezone)
      ))::numeric / 60 as end_min
    from public.shift_blocks sb
    where sb.salon_id = v_salon.id
      and sb.starts_at < v_end
      and sb.ends_at   > v_start
      and (p_tech_id is null or sb.tech_id = p_tech_id)
  ),
  appts as (
    select
      ap.id,
      ap.tech_id,
      ap.customer_id,
      c.name        as client_name,
      ap.status::text as status,
      ap.notes,
      ap.service_name,
      public.appointment_minutes(ap.id) as duration_min,
      extract(epoch from (
        (ap.scheduled_at at time zone v_salon.timezone)
        - date_trunc('day', v_start at time zone v_salon.timezone)
      ))::numeric / 60 as start_min,
      coalesce(
        (select string_agg(a.name, ', ' order by a.sort_order, a.name)
           from public.appointment_services a
          where a.appointment_id = ap.id),
        ap.service_name
      ) as services
    from public.appointments ap
    join public.customers c on c.id = ap.customer_id
    where ap.salon_id = v_salon.id
      and ap.scheduled_at >= v_start
      and ap.scheduled_at <  v_end
      and ap.status <> 'cancelled'
      and (p_tech_id is null or ap.tech_id = p_tech_id)
  ),
  -- Columns are techs who are *on* that day: anyone with a shift, plus anyone
  -- who has a booking without one — those are the rows a manager most needs to
  -- see, so hiding them for lack of a shift record would defeat the screen.
  column_ids as (
    select distinct tech_id from bands where tech_id is not null
    union
    select distinct tech_id from appts where tech_id is not null
  )
  select jsonb_build_object(
    'day',          p_day,
    'timezone',     v_salon.timezone,
    'open_minute',  coalesce(v_salon.open_hour, 9) * 60,
    'close_minute', coalesce(v_salon.close_hour, 20) * 60,
    'techs', coalesce((
      select jsonb_agg(t order by t->>'full_name')
      from (
        select jsonb_build_object(
          'id',        p.id,
          'full_name', p.full_name,
          -- Drives the "booked with no shift on the rota" warning badge.
          'has_shift', exists (
            select 1 from bands b where b.tech_id = p.id and b.kind = 'shift'
          )
        ) as t
        from public.profiles p
        join column_ids ci on ci.tech_id = p.id
        where p.salon_id = v_salon.id
      ) rows
    ), '[]'::jsonb),
    'bands', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tech_id',   b.tech_id,
        'kind',      b.kind,
        'note',      b.note,
        'start_min', round(b.start_min),
        'end_min',   round(b.end_min)
      ))
      from bands b where b.tech_id is not null
    ), '[]'::jsonb),
    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',           a.id,
        'tech_id',      a.tech_id,
        'customer_id',  a.customer_id,
        'client_name',  a.client_name,
        'status',       a.status,
        'notes',        a.notes,
        'service_name', a.service_name,
        'services',     a.services,
        'start_min',    round(a.start_min),
        'duration_min', a.duration_min
      ) order by a.start_min)
      from appts a
    ), '[]'::jsonb),
    -- Counted separately so "nobody is scheduled" and "nothing is booked" are
    -- distinguishable empty states rather than one blank grid.
    'unassigned_count', (select count(*) from appts where tech_id is null)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.day_calendar(date, uuid) from public;
grant execute on function public.day_calendar(date, uuid) to authenticated;
