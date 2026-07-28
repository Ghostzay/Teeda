-- ============================================================================
-- "My usual week."
--
-- Most techs work the same days every week. Marking each one by hand is the
-- kind of chore that gets done in week one and abandoned by week three, and an
-- empty calendar is worse than no calendar — the floor stops trusting it.
--
-- So: one pattern per tech, stated once. "Tuesdays, Thursdays and Saturdays,
-- 10 to 6, until I say otherwise."
--
-- ---------------------------------------------------------------------------
-- Materialised, not computed
-- ---------------------------------------------------------------------------
-- The pattern generates real `shift_blocks` rows rather than being unioned in
-- at read time. Three reasons:
--
--   1. `turn_queue`, `floor_status`, `schedule_overlay` and `month_availability`
--      all read shift_blocks. Computing the union in each would repeat the rule
--      four times, which is how the four of them drift apart.
--   2. A generated day has to be editable. "I'm normally in Tuesdays but not
--      *this* Tuesday" is the common case, and you cannot delete a row that
--      only exists as a calculation.
--   3. It stays inspectable — what the calendar shows is what is in the table.
--
-- Generated rows carry `pattern_id`, so re-saving a pattern can replace its own
-- future output without touching anything a human entered by hand.
-- ============================================================================

create table public.availability_patterns (
  id             uuid primary key default gen_random_uuid(),
  salon_id       uuid not null default public.current_salon_id()
                   references public.salons (id) on delete cascade,
  tech_id        uuid not null references public.profiles (id) on delete cascade,
  -- ISO day of week: 1 = Monday … 7 = Sunday, matching extract(isodow).
  weekdays       smallint[] not null,
  start_time     time not null,
  end_time       time not null,
  effective_from date not null default current_date,
  -- NULL is the whole point: "until I say otherwise".
  effective_to   date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- One usual week per tech. A tech with two competing "usual" weeks does not
  -- have a usual week; they have exceptions, which is what the calendar is for.
  unique (tech_id),
  constraint availability_patterns_weekdays_valid
    check (
      cardinality(weekdays) between 1 and 7
      and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    ),
  constraint availability_patterns_range_valid
    check (effective_to is null or effective_to >= effective_from)
);

create index availability_patterns_salon_idx
  on public.availability_patterns (salon_id);

alter table public.availability_patterns enable row level security;

create policy "salon members can see patterns"
  on public.availability_patterns for select
  to authenticated
  using (salon_id = public.current_salon_id());

grant select on public.availability_patterns to authenticated;

-- Writes go through the functions below, which enforce "your own, or anyone's
-- if you run the floor" and keep generation in step.

-- Which pattern produced a generated day. NULL means a human typed it.
alter table public.shift_blocks
  add column pattern_id uuid references public.availability_patterns (id) on delete set null;

create index shift_blocks_pattern_idx
  on public.shift_blocks (pattern_id)
  where pattern_id is not null;

comment on column public.shift_blocks.pattern_id is
  'Set when this day came from the tech''s usual week. NULL = entered by hand, '
  'and never replaced by regeneration.';

-- ----------------------------------------------------------------------------
-- Fill the calendar forward from a pattern.
--
-- A year ahead, in one go. That is ~156 rows for a three-day week — small
-- enough that a rolling horizon with a top-up job would be more moving parts
-- than the problem deserves.
--
-- A day that already has a shift is skipped, whatever produced it. An explicit
-- entry always wins over the usual week, because the person who typed it knew
-- something the pattern does not.
-- ----------------------------------------------------------------------------
create or replace function public.generate_pattern_blocks(p_tech_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_pattern public.availability_patterns;
  v_zone    text;
  v_day     date;
  v_last    date;
  v_start   timestamptz;
  v_end     timestamptz;
  v_added   integer := 0;
begin
  select * into v_pattern
  from public.availability_patterns
  where tech_id = p_tech_id and salon_id = public.current_salon_id();

  if not found then
    return 0;
  end if;

  select coalesce(timezone, 'UTC') into v_zone
  from public.salons where id = public.current_salon_id();

  -- Never backfill: the past is a record, not a plan.
  v_day  := greatest(v_pattern.effective_from, public.salon_today());
  v_last := least(
    coalesce(v_pattern.effective_to, public.salon_today() + 365),
    public.salon_today() + 365
  );

  while v_day <= v_last loop
    if extract(isodow from v_day)::smallint = any (v_pattern.weekdays) then
      -- Anything already on that day wins, pattern or not.
      if not exists (
        select 1 from public.shift_blocks b
        where b.tech_id = p_tech_id
          and b.kind = 'shift'
          and (b.starts_at at time zone v_zone)::date = v_day
      ) then
        v_start := (v_day + v_pattern.start_time) at time zone v_zone;
        v_end   := (v_day + v_pattern.end_time)   at time zone v_zone;
        if v_end <= v_start then
          v_end := v_end + interval '1 day';
        end if;

        insert into public.shift_blocks
          (salon_id, tech_id, kind, starts_at, ends_at, created_by, pattern_id)
        values
          (v_pattern.salon_id, p_tech_id, 'shift', v_start, v_end, auth.uid(), v_pattern.id);

        v_added := v_added + 1;
      end if;
    end if;

    v_day := v_day + 1;
  end loop;

  return v_added;
end;
$$;

revoke all on function public.generate_pattern_blocks(uuid) from public;
grant execute on function public.generate_pattern_blocks(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- State (or restate) a usual week.
--
-- Restating replaces the pattern's own future output and regenerates. Days a
-- human entered by hand are left alone — including the "I'm off this one
-- Tuesday" that someone cleared deliberately, which is why the clear-down is
-- scoped to `pattern_id` rather than to the tech.
-- ----------------------------------------------------------------------------
create or replace function public.save_availability_pattern(
  p_tech_id  uuid,
  p_weekdays smallint[],
  p_from     time,
  p_to       time,
  p_ends     date default null
)
returns public.availability_patterns
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tech uuid := coalesce(p_tech_id, auth.uid());
  v_row  public.availability_patterns;
begin
  if v_tech is distinct from auth.uid() and not public.can_manage_floor() then
    raise exception 'You can only set your own usual week'
      using errcode = 'insufficient_privilege';
  end if;

  if p_weekdays is null or cardinality(p_weekdays) = 0 then
    raise exception 'Pick at least one day of the week' using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_tech and salon_id = public.current_salon_id() and is_active
  ) then
    raise exception 'That tech is not on this salon''s roster' using errcode = 'no_data_found';
  end if;

  insert into public.availability_patterns
    (salon_id, tech_id, weekdays, start_time, end_time, effective_from, effective_to)
  values
    (public.current_salon_id(), v_tech, p_weekdays, p_from, p_to, public.salon_today(), p_ends)
  on conflict (tech_id) do update
    set weekdays     = excluded.weekdays,
        start_time   = excluded.start_time,
        end_time     = excluded.end_time,
        effective_to = excluded.effective_to,
        updated_at   = now()
  returning * into v_row;

  -- Drop this pattern's own future days, then lay them down again.
  delete from public.shift_blocks
  where pattern_id = v_row.id
    and starts_at >= public.salon_day_start();

  perform public.generate_pattern_blocks(v_tech);

  return v_row;
end;
$$;

revoke all on function public.save_availability_pattern(uuid, smallint[], time, time, date) from public;
grant execute on function public.save_availability_pattern(uuid, smallint[], time, time, date) to authenticated;

-- Stop the usual week. Future generated days go; past ones stay, because they
-- are a record of what was planned, and payroll questions look backwards.
create or replace function public.clear_availability_pattern(p_tech_id uuid default null)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tech    uuid := coalesce(p_tech_id, auth.uid());
  v_id      uuid;
  v_removed integer := 0;
begin
  if v_tech is distinct from auth.uid() and not public.can_manage_floor() then
    raise exception 'You can only change your own usual week'
      using errcode = 'insufficient_privilege';
  end if;

  select id into v_id
  from public.availability_patterns
  where tech_id = v_tech and salon_id = public.current_salon_id();

  if v_id is null then
    return 0;
  end if;

  delete from public.shift_blocks
  where pattern_id = v_id and starts_at >= public.salon_day_start();
  get diagnostics v_removed = row_count;

  -- Detach what is left so history survives the pattern being deleted.
  update public.shift_blocks set pattern_id = null where pattern_id = v_id;
  delete from public.availability_patterns where id = v_id;

  return v_removed;
end;
$$;

revoke all on function public.clear_availability_pattern(uuid) from public;
grant execute on function public.clear_availability_pattern(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Read the usual week back, for the form and for the nudge.
-- ----------------------------------------------------------------------------
create or replace function public.availability_patterns_for_salon()
returns table (
  tech_id      uuid,
  tech_name    text,
  weekdays     smallint[],
  start_time   time,
  end_time     time,
  effective_to date,
  editable     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.tech_id,
    p.full_name,
    a.weekdays,
    a.start_time,
    a.end_time,
    a.effective_to,
    (public.can_manage_floor() or a.tech_id = auth.uid())
  from public.availability_patterns a
  join public.profiles p on p.id = a.tech_id
  where a.salon_id = public.current_salon_id()
  order by p.full_name;
$$;

revoke all on function public.availability_patterns_for_salon() from public;
grant execute on function public.availability_patterns_for_salon() to authenticated;

-- ----------------------------------------------------------------------------
-- The nudge: who has nothing on the calendar in the next N days.
--
-- The month view only helps if it gets filled in, and nobody remembers to fill
-- in a calendar. This is what lets a screen say "you have no days marked next
-- week" to the one person who can fix it.
-- ----------------------------------------------------------------------------
create or replace function public.unmarked_techs(p_days integer default 7)
returns table (
  tech_id     uuid,
  full_name   text,
  has_pattern boolean,
  days_marked integer
)
language sql
stable
security definer
set search_path = public
as $$
  with s as (select public.current_salon_id() as id),
       tz as (select coalesce(sa.timezone, 'UTC') as zone from public.salons sa, s where sa.id = s.id),
       window_ as (
         select public.salon_today() as from_day,
                public.salon_today() + greatest(p_days, 1) as to_day
       )
  select
    p.id,
    p.full_name,
    exists (select 1 from public.availability_patterns a where a.tech_id = p.id),
    coalesce(marked.n, 0)::int
  from public.profiles p
  cross join s
  left join lateral (
    select count(distinct (b.starts_at at time zone tz.zone)::date) as n
    from public.shift_blocks b, tz, window_
    where b.tech_id = p.id
      and b.kind = 'shift'
      and (b.starts_at at time zone tz.zone)::date >= window_.from_day
      and (b.starts_at at time zone tz.zone)::date <  window_.to_day
  ) marked on true
  where p.salon_id = s.id
    and p.role::text = 'tech'
    and p.is_active
    and coalesce(marked.n, 0) = 0
  order by p.full_name;
$$;

revoke all on function public.unmarked_techs(integer) from public;
grant execute on function public.unmarked_techs(integer) to authenticated;
