-- ============================================================================
-- Three fixes and one addition, all about "why can't I see my bookings?".
--
-- 1. An unassigned booking was invisible everywhere.
-- 2. A day meant a day in the *server's* timezone, so evening bookings landed
--    on the wrong date.
-- 3. Appointments could be created and cancelled but never edited.
-- 4. A service log — waiting, in service, finished — for the floor and for a
--    tech's own day.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The salon's day, for any date.
--
-- `dayRange()` in the app built midnight from `new Date(y, m, d)`, which is
-- midnight in whatever timezone the Node process happens to run in — UTC on
-- Vercel. For a salon in New York that window is 8pm to 8pm, so a 9pm booking
-- fell into the *next* day and a 7pm booking from yesterday appeared in today.
-- Exactly the class of bug the salon clock was introduced to end; this is the
-- one caller that was missed.
-- ----------------------------------------------------------------------------
create or replace function public.salon_day_bounds(p_day date)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  -- Parentheses matter: `at time zone` binds tighter than `+`, so `p_day + 1
  -- at time zone z` parses as `p_day + (1 at time zone z)` and fails.
  select
    ((p_day)::timestamp     at time zone coalesce(s.timezone, 'UTC')),
    ((p_day + 1)::timestamp at time zone coalesce(s.timezone, 'UTC'))
  from public.salons s
  where s.id = public.current_salon_id();
$$;

revoke all on function public.salon_day_bounds(date) from public;
grant execute on function public.salon_day_bounds(date) to authenticated;

-- ----------------------------------------------------------------------------
-- Edit a booking.
--
-- There was create and cancel and nothing in between, so a mistyped time meant
-- cancelling and rebooking — which loses the thread for the client and leaves
-- a cancelled row behind. Every field the booking form collects is editable.
--
-- The `appointments_sync_block` trigger keeps the calendar block in step, so
-- moving a booking moves its slot on the schedule with it.
-- ----------------------------------------------------------------------------
create or replace function public.update_appointment(
  p_id           uuid,
  p_scheduled_at timestamptz default null,
  p_tech_id      uuid default null,
  p_service_id   uuid default null,
  p_customer_id  uuid default null,
  p_notes        text default null,
  p_clear_tech   boolean default false
)
returns public.appointments
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row     public.appointments;
  v_service public.services;
begin
  if not public.can_manage_floor() then
    raise exception 'Only the front desk can change a booking'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from public.appointments
  where id = p_id and salon_id = public.current_salon_id();

  if not found then
    raise exception 'That booking no longer exists' using errcode = 'no_data_found';
  end if;

  if v_row.status = 'completed' then
    raise exception 'That booking is already finished' using errcode = 'check_violation';
  end if;

  if p_service_id is not null then
    select * into v_service from public.services
    where id = p_service_id and salon_id = public.current_salon_id();
    if not found then
      raise exception 'That service is not on the menu' using errcode = 'no_data_found';
    end if;
  end if;

  -- A tech has to be on the roster, and has to do the work.
  if p_tech_id is not null then
    if not exists (
      select 1 from public.profiles
      where id = p_tech_id and salon_id = public.current_salon_id() and is_active
    ) then
      raise exception 'That tech is not on this salon''s roster' using errcode = 'no_data_found';
    end if;

    if v_service.id is not null and cardinality(v_service.required_skills) > 0 then
      if not (
        select coalesce(skills, '{}') @> v_service.required_skills
        from public.profiles where id = p_tech_id
      ) then
        raise exception 'That tech does not do this service' using errcode = 'check_violation';
      end if;
    end if;
  end if;

  update public.appointments
     set scheduled_at = coalesce(p_scheduled_at, scheduled_at),
         -- `p_clear_tech` exists because NULL already means "leave it alone";
         -- without it there is no way to say "actually, nobody".
         tech_id      = case when p_clear_tech then null
                             else coalesce(p_tech_id, tech_id) end,
         service_id   = coalesce(p_service_id, service_id),
         service_name = coalesce(v_service.name, service_name),
         customer_id  = coalesce(p_customer_id, customer_id),
         notes        = case when p_notes is null then notes
                             else nullif(trim(p_notes), '') end
   where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.update_appointment(uuid, timestamptz, uuid, uuid, uuid, text, boolean) from public;
grant execute on function public.update_appointment(uuid, timestamptz, uuid, uuid, uuid, text, boolean) to authenticated;

-- ============================================================================
-- Unassigned bookings were invisible.
--
-- `schedule_overlay` inner-joined appointments to profiles and filtered
-- `tech_id is not null`, so a booking nobody had been given yet appeared on no
-- screen at all — and those are precisely the ones that need attention before
-- the client arrives.
--
-- They now come back with a NULL tech_id and the name 'Unassigned', so the
-- grid can give them a column of their own.
-- ============================================================================
create or replace function public.schedule_overlay(
  p_from    timestamptz,
  p_to      timestamptz,
  p_tech_id uuid default null
)
returns table (
  id          uuid,
  layer       text,
  kind        text,
  tech_id     uuid,
  tech_name   text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  title       text,
  status      text,
  editable    boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as uid, public.can_manage_floor() as floor)
  -- Availability the tech maintains.
  select
    s.id, 'shift'::text, s.kind::text, s.tech_id, p.full_name,
    s.starts_at, s.ends_at,
    coalesce(s.note, initcap(replace(s.kind::text, '_', ' '))),
    s.kind::text,
    (m.floor or s.tech_id = m.uid)
  from public.shift_blocks s
  join public.profiles p on p.id = s.tech_id
  cross join me m
  where s.salon_id = public.current_salon_id()
    and s.starts_at < p_to and s.ends_at > p_from
    and (p_tech_id is null or s.tech_id = p_tech_id)

  union all

  -- Booked appointments, including ones nobody has been given yet. Editable by
  -- the front desk now that update_appointment exists.
  select
    a.id, 'appointment'::text, 'appointment'::text, a.tech_id,
    coalesce(p.full_name, 'Unassigned'),
    a.scheduled_at,
    a.scheduled_at + make_interval(mins => coalesce(sv.duration_minutes, 45)),
    coalesce(c.name, 'Client') || ' · ' || a.service_name,
    a.status::text,
    m.floor
  from public.appointments a
  left join public.profiles p on p.id = a.tech_id
  left join public.services sv on sv.id = a.service_id
  left join public.customers c on c.id = a.customer_id
  cross join me m
  where a.salon_id = public.current_salon_id()
    and a.status not in ('cancelled')
    and a.scheduled_at < p_to
    and a.scheduled_at + make_interval(mins => coalesce(sv.duration_minutes, 45)) > p_from
    -- Asking for one tech's column still shows the unassigned ones, because
    -- "who is free to take this?" is the question that column exists to answer.
    and (p_tech_id is null or a.tech_id = p_tech_id or a.tech_id is null)

  union all

  -- Walk-ins that have been checked in. Read-only.
  select
    j.id, 'walkin'::text, j.status::text, j.tech_id,
    coalesce(p.full_name, 'Unassigned'),
    j.checked_in_at,
    coalesce(j.completed_at, j.checked_in_at + make_interval(mins => 45)),
    coalesce(c.name, 'Walk-in') || ' · ' || j.service_name,
    j.status::text,
    false
  from public.jobs j
  left join public.profiles p on p.id = j.tech_id
  left join public.customers c on c.id = j.customer_id
  cross join me m
  where j.salon_id = public.current_salon_id()
    and j.type = 'walk-in'
    and j.status not in ('cancelled')
    and j.checked_in_at < p_to
    and coalesce(j.completed_at, j.checked_in_at + make_interval(mins => 45)) > p_from
    and (p_tech_id is null or j.tech_id = p_tech_id or j.tech_id is null)

  order by 6, 5;
$$;

revoke all on function public.schedule_overlay(timestamptz, timestamptz, uuid) from public;
grant execute on function public.schedule_overlay(timestamptz, timestamptz, uuid) to authenticated;

-- ============================================================================
-- The service log: waiting, in service, finished — for one day.
--
-- The floor sees everyone; a tech sees their own. Same function, because the
-- difference is a filter and not a different question, and two functions would
-- drift.
-- ============================================================================
create or replace function public.service_log(p_day date default null, p_tech_id uuid default null)
returns table (
  id            uuid,
  status        text,
  tech_id       uuid,
  tech_name     text,
  customer_name text,
  service_name  text,
  checked_in_at timestamptz,
  started_at    timestamptz,
  completed_at  timestamptz,
  is_appointment boolean,
  amount        numeric,
  tip           numeric,
  paid          boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with day as (
    select * from public.salon_day_bounds(coalesce(p_day, public.salon_today()))
  ),
  scope as (
    -- A tech may only ever see their own, whatever they ask for.
    select case when public.can_manage_floor() then p_tech_id else auth.uid() end as tech
  )
  select
    j.id,
    j.status::text,
    j.tech_id,
    coalesce(p.full_name, 'Unassigned'),
    coalesce(c.name, 'Walk-in'),
    j.service_name,
    j.checked_in_at,
    j.started_at,
    j.completed_at,
    (j.type = 'appointment'),
    coalesce(pay.service_amount, 0)::numeric,
    coalesce(pay.tip_amount, 0)::numeric,
    (pay.id is not null)
  from public.jobs j
  cross join day d
  cross join scope s
  left join public.profiles p on p.id = j.tech_id
  left join public.customers c on c.id = j.customer_id
  left join public.payments pay on pay.job_id = j.id
  where j.salon_id = public.current_salon_id()
    and j.status <> 'cancelled'
    and j.checked_in_at >= d.starts_at
    and j.checked_in_at <  d.ends_at
    and (s.tech is null or j.tech_id = s.tech)
  order by
    case j.status when 'waiting' then 0 when 'in_progress' then 1 else 2 end,
    j.checked_in_at;
$$;

revoke all on function public.service_log(date, uuid) from public;
grant execute on function public.service_log(date, uuid) to authenticated;
