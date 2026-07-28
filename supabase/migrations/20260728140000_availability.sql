-- ============================================================================
-- Month-at-a-glance availability.
--
-- The schedule screen is not a timesheet — it answers "who is in on the 14th,
-- and how full is that day?". Drawing a month from raw overlay rows would mean
-- shipping every appointment in the month to the browser to count them, so the
-- rollup happens here: one row per tech per day they are in.
--
-- Days are the salon's local days (see `salon_today()` in 130000), so a shift
-- that ends at 8pm local never lands on tomorrow's square.
-- ============================================================================

-- ============================================================================
-- A break has to be allowed to sit inside a shift.
--
-- `shift_blocks_no_self_overlap` forbids ANY overlap per tech regardless of
-- kind, which makes the thing this screen exists for impossible: a tech cannot
-- mark 1–2pm out of office on a day they are working 10–6, because the time
-- off overlaps their own shift.
--
-- That is one constraint expressing two different rules. Split it:
--
--   shifts     must not overlap each other   — you work one shift at a time
--   carve-outs must not overlap each other   — one break at a time
--   a carve-out inside a shift is the normal case, not a conflict
--
-- Strictly more permissive than what it replaces, so existing rows all still
-- satisfy it and nothing is lost. No data is touched.
-- ============================================================================

alter table public.shift_blocks
  drop constraint if exists shift_blocks_no_self_overlap;

alter table public.shift_blocks
  add constraint shift_blocks_shifts_no_overlap
  exclude using gist (
    tech_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (kind = 'shift');

alter table public.shift_blocks
  add constraint shift_blocks_breaks_no_overlap
  exclude using gist (
    tech_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (kind <> 'shift');

comment on constraint shift_blocks_shifts_no_overlap on public.shift_blocks is
  'One shift at a time per tech. Breaks and time off deliberately excluded — '
  'they are carve-outs within a shift.';

-- ----------------------------------------------------------------------------
-- Say which kind clashed.
--
-- With one constraint there was one message. Now that shifts and carve-outs
-- are policed separately, "that overlaps another shift" is wrong half the time
-- — a tech told that when their dentist appointment clashed with their school
-- run would go looking for a shift that isn't the problem.
-- ----------------------------------------------------------------------------
create or replace function public.save_shift(
  p_id        uuid,
  p_tech_id   uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz,
  p_kind      text default 'shift',
  p_note      text default null
)
returns public.shift_blocks
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tech uuid := coalesce(p_tech_id, auth.uid());
  v_kind public.shift_kind := coalesce(nullif(p_kind, ''), 'shift')::public.shift_kind;
  v_row  public.shift_blocks;
begin
  if v_tech <> auth.uid() and not public.can_manage_floor() then
    raise exception 'You can only change your own hours' using errcode = 'insufficient_privilege';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'The end time must be after the start time' using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_tech and salon_id = public.current_salon_id()
  ) then
    raise exception 'That tech is not on this salon''s roster' using errcode = 'no_data_found';
  end if;

  begin
    if p_id is null then
      insert into public.shift_blocks (salon_id, tech_id, kind, starts_at, ends_at, note, created_by)
      values (
        public.current_salon_id(), v_tech, v_kind,
        p_starts_at, p_ends_at, nullif(trim(coalesce(p_note, '')), ''), auth.uid()
      )
      returning * into v_row;
    else
      update public.shift_blocks
      set tech_id   = v_tech,
          kind      = v_kind,
          starts_at = p_starts_at,
          ends_at   = p_ends_at,
          note      = nullif(trim(coalesce(p_note, '')), '')
      where id = p_id
        and salon_id = public.current_salon_id()
      returning * into v_row;

      if not found then
        raise exception 'That entry no longer exists' using errcode = 'no_data_found';
      end if;
    end if;
  exception when exclusion_violation then
    if v_kind = 'shift' then
      raise exception 'That tech is already working part of those hours'
        using errcode = 'unique_violation';
    else
      raise exception 'That clashes with another break or time off already marked'
        using errcode = 'unique_violation';
    end if;
  end;

  return v_row;
end;
$$;

revoke all on function public.save_shift(uuid, uuid, timestamptz, timestamptz, text, text) from public;
grant execute on function public.save_shift(uuid, uuid, timestamptz, timestamptz, text, text) to authenticated;


create or replace function public.month_availability(p_from date, p_to date)
returns table (
  day            date,
  tech_id        uuid,
  tech_name      text,
  kind           public.shift_kind,
  starts_at      timestamptz,
  ends_at        timestamptz,
  note           text,
  editable       boolean,
  booking_count  integer
)
language sql
stable
security definer
set search_path = public
as $$
  with s as (select public.current_salon_id() as id),
       tz as (
         select coalesce(sa.timezone, 'UTC') as zone
         from public.salons sa, s where sa.id = s.id
       ),
       blocks as (
         select
           (b.starts_at at time zone tz.zone)::date as day,
           b.tech_id,
           p.full_name as tech_name,
           b.kind,
           b.starts_at,
           b.ends_at,
           b.note
         from public.shift_blocks b
         join public.profiles p on p.id = b.tech_id
         cross join tz
         cross join s
         where b.salon_id = s.id
           and (b.starts_at at time zone tz.zone)::date >= p_from
           and (b.starts_at at time zone tz.zone)::date <  p_to
       ),
       -- Anything already booked against that tech on that day: appointments
       -- and walk-ins alike, so a square can say "in, and already busy".
       bookings as (
         select
           (a.scheduled_at at time zone tz.zone)::date as day,
           a.tech_id,
           count(*)::int as n
         from public.appointments a
         cross join tz
         cross join s
         where a.salon_id = s.id
           and a.tech_id is not null
           and a.status not in ('cancelled', 'completed')
           and (a.scheduled_at at time zone tz.zone)::date >= p_from
           and (a.scheduled_at at time zone tz.zone)::date <  p_to
         group by 1, 2
         union all
         select
           (j.checked_in_at at time zone tz.zone)::date,
           j.tech_id,
           count(*)::int
         from public.jobs j
         cross join tz
         cross join s
         where j.salon_id = s.id
           and j.tech_id is not null
           and j.status <> 'cancelled'
           and (j.checked_in_at at time zone tz.zone)::date >= p_from
           and (j.checked_in_at at time zone tz.zone)::date <  p_to
         group by 1, 2
       ),
       booked as (
         select day, tech_id, sum(n)::int as n from bookings group by 1, 2
       )
  select
    b.day,
    b.tech_id,
    b.tech_name,
    b.kind,
    b.starts_at,
    b.ends_at,
    b.note,
    -- Same rule as the day grid: your own, or anyone's if you run the floor.
    (public.can_manage_floor() or b.tech_id = auth.uid()) as editable,
    coalesce(k.n, 0) as booking_count
  from blocks b
  left join booked k on k.day = b.day and k.tech_id = b.tech_id
  order by b.day, b.starts_at, b.tech_name;
$$;

revoke all on function public.month_availability(date, date) from public;
grant execute on function public.month_availability(date, date) to authenticated;

-- ----------------------------------------------------------------------------
-- Marking a whole day in or out.
--
-- The month view works in days, not instants: "I'm in on the 14th, 9 to 5".
-- Doing that through `save_shift` from the client would mean the browser
-- building timestamps in the salon's timezone, which it does not reliably know.
-- This takes a date and two clock times and resolves them here.
-- ----------------------------------------------------------------------------
create or replace function public.set_day_availability(
  p_tech_id uuid,
  p_day     date,
  p_from    time,
  p_to      time,
  p_kind    text default 'shift',
  p_note    text default null
)
returns public.shift_blocks
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_zone  text;
  v_start timestamptz;
  v_end   timestamptz;
  v_row   public.shift_blocks;
begin
  if p_tech_id is distinct from auth.uid() and not public.can_manage_floor() then
    raise exception 'You can only change your own days'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(timezone, 'UTC') into v_zone
  from public.salons where id = public.current_salon_id();

  v_start := (p_day + p_from) at time zone v_zone;
  v_end   := (p_day + p_to)   at time zone v_zone;

  -- A shift that runs past midnight is a real thing in a late-closing salon.
  if v_end <= v_start then
    v_end := v_end + interval '1 day';
  end if;

  -- Re-stating your shift for a day replaces it: "I work 10 to 6" is one fact
  -- about the day, and saying it twice should not stack. Breaks and time off
  -- append instead — two separate errands in one day is ordinary, and the
  -- carve-out constraint still stops them landing on top of each other.
  if p_kind = 'shift' then
    delete from public.shift_blocks
    where tech_id = p_tech_id
      and kind = 'shift'
      and (starts_at at time zone v_zone)::date = p_day;
  end if;

  return public.save_shift(null, p_tech_id, v_start, v_end, p_kind, p_note);
end;
$$;

revoke all on function public.set_day_availability(uuid, date, time, time, text, text) from public;
grant execute on function public.set_day_availability(uuid, date, time, time, text, text) to authenticated;

-- Clear a day entirely — "I'm not in on the 14th after all".
create or replace function public.clear_day_availability(p_tech_id uuid, p_day date)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_zone    text;
  v_deleted integer;
begin
  if p_tech_id is distinct from auth.uid() and not public.can_manage_floor() then
    raise exception 'You can only change your own days'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(timezone, 'UTC') into v_zone
  from public.salons where id = public.current_salon_id();

  delete from public.shift_blocks
  where tech_id = p_tech_id
    and salon_id = public.current_salon_id()
    and (starts_at at time zone v_zone)::date = p_day;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.clear_day_availability(uuid, date) from public;
grant execute on function public.clear_day_availability(uuid, date) to authenticated;
