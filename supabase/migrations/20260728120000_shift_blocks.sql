-- ============================================================================
-- Shift / availability blocks.
--
-- Why a new table rather than reusing `schedule_blocks`:
-- `schedule_blocks` carries a GiST exclusion constraint that forbids ANY
-- overlap per tech, because it models "this tech is unavailable" (appointment
-- holds and breaks). A shift is the opposite — it is the window a tech is
-- *available*, and appointments are expected to sit inside it. Putting shifts
-- in that table would make every booking violate the constraint.
--
-- Nothing existing is altered. `schedule_blocks`, appointments and jobs are
-- untouched and still drive the turn rotation.
-- ============================================================================

create type public.shift_kind as enum ('shift', 'break', 'time_off');

create table public.shift_blocks (
  id         uuid primary key default gen_random_uuid(),
  -- Single salon this iteration; the column stays so multi-salon remains open.
  salon_id   uuid not null default public.current_salon_id()
               references public.salons (id) on delete cascade,
  tech_id    uuid not null references public.profiles (id) on delete cascade,
  kind       public.shift_kind not null default 'shift',
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  note       text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint shift_blocks_ordered check (ends_at > starts_at)
);

create index shift_blocks_tech_day_idx on public.shift_blocks (tech_id, starts_at);
create index shift_blocks_salon_day_idx on public.shift_blocks (salon_id, starts_at);

-- A tech can't be on two shifts at once. Appointments live in another table,
-- so a booking inside a shift is not an overlap here — which is the point.
alter table public.shift_blocks
  add constraint shift_blocks_no_self_overlap
  exclude using gist (
    tech_id with =,
    tstzrange(starts_at, ends_at) with &&
  );

create trigger shift_blocks_touch_updated_at
  before update on public.shift_blocks
  for each row execute function public.touch_updated_at();

alter table public.shift_blocks enable row level security;

-- Who is working when is shared knowledge on the floor.
create policy "salon members can view shifts"
  on public.shift_blocks for select
  to authenticated
  using (salon_id = public.current_salon_id());

create policy "techs add their own shifts, front desk adds anyone's"
  on public.shift_blocks for insert
  to authenticated
  with check (
    salon_id = public.current_salon_id()
    and (tech_id = auth.uid() or public.can_manage_floor())
  );

create policy "techs edit their own shifts, front desk edits any"
  on public.shift_blocks for update
  to authenticated
  using (
    salon_id = public.current_salon_id()
    and (tech_id = auth.uid() or public.can_manage_floor())
  )
  with check (salon_id = public.current_salon_id());

create policy "techs delete their own shifts, front desk deletes any"
  on public.shift_blocks for delete
  to authenticated
  using (
    salon_id = public.current_salon_id()
    and (tech_id = auth.uid() or public.can_manage_floor())
  );

grant select, insert, update, delete on public.shift_blocks to authenticated;

alter publication supabase_realtime add table public.shift_blocks;

-- ----------------------------------------------------------------------------
-- Create / update / delete
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
  v_row  public.shift_blocks;
begin
  if v_tech <> auth.uid() and not public.can_manage_floor() then
    raise exception 'You can only change your own shifts' using errcode = 'insufficient_privilege';
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
        public.current_salon_id(), v_tech,
        coalesce(nullif(p_kind, ''), 'shift')::public.shift_kind,
        p_starts_at, p_ends_at, nullif(trim(coalesce(p_note, '')), ''), auth.uid()
      )
      returning * into v_row;
    else
      update public.shift_blocks
      set tech_id   = v_tech,
          kind      = coalesce(nullif(p_kind, ''), 'shift')::public.shift_kind,
          starts_at = p_starts_at,
          ends_at   = p_ends_at,
          note      = nullif(trim(coalesce(p_note, '')), '')
      where id = p_id
        and salon_id = public.current_salon_id()
      returning * into v_row;

      if not found then
        raise exception 'That shift no longer exists' using errcode = 'no_data_found';
      end if;
    end if;
  exception when exclusion_violation then
    raise exception 'That overlaps another shift for the same tech'
      using errcode = 'unique_violation';
  end;

  return v_row;
end;
$$;

create or replace function public.delete_shift(p_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row   public.shift_blocks;
  v_count integer;
begin
  select * into v_row from public.shift_blocks where id = p_id;
  if not found then
    return 0;
  end if;

  if v_row.tech_id <> auth.uid() and not public.can_manage_floor() then
    raise exception 'You can only remove your own shifts' using errcode = 'insufficient_privilege';
  end if;

  delete from public.shift_blocks where id = p_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.save_shift(uuid, uuid, timestamptz, timestamptz, text, text) from public;
revoke all on function public.delete_shift(uuid) from public;
grant execute on function public.save_shift(uuid, uuid, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.delete_shift(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Everything the grid draws, in one call.
--
-- Three layers in one result set so the client makes a single round trip and
-- can lay overlapping items out in lanes:
--   shift     editable   the tech's own availability
--   appointment read-only from the booking flow
--   walkin      read-only from job check-ins
-- ----------------------------------------------------------------------------
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

  -- Booked appointments. Read-only here; edited from the booking screen.
  select
    a.id, 'appointment'::text, 'appointment'::text, a.tech_id, p.full_name,
    a.scheduled_at,
    a.scheduled_at + make_interval(mins => coalesce(sv.duration_minutes, 45)),
    coalesce(c.name, 'Client') || ' · ' || a.service_name,
    a.status::text,
    false
  from public.appointments a
  join public.profiles p on p.id = a.tech_id
  left join public.services sv on sv.id = a.service_id
  left join public.customers c on c.id = a.customer_id
  where a.salon_id = public.current_salon_id()
    and a.tech_id is not null
    and a.status not in ('cancelled')
    and a.scheduled_at < p_to
    and a.scheduled_at + make_interval(mins => coalesce(sv.duration_minutes, 45)) > p_from
    and (p_tech_id is null or a.tech_id = p_tech_id)

  union all

  -- Walk-ins that have been checked in. Read-only.
  select
    j.id, 'walkin'::text, j.status::text, j.tech_id, p.full_name,
    j.checked_in_at,
    coalesce(j.completed_at, j.checked_in_at + make_interval(mins => 45)),
    coalesce(c.name, 'Walk-in') || ' · ' || j.service_name,
    j.status::text,
    false
  from public.jobs j
  join public.profiles p on p.id = j.tech_id
  left join public.customers c on c.id = j.customer_id
  where j.salon_id = public.current_salon_id()
    and j.tech_id is not null
    and j.type = 'walk-in'
    and j.status not in ('cancelled')
    and j.checked_in_at < p_to
    and coalesce(j.completed_at, j.checked_in_at + make_interval(mins => 45)) > p_from
    and (p_tech_id is null or j.tech_id = p_tech_id)

  order by 6, 5;
$$;

revoke all on function public.schedule_overlay(timestamptz, timestamptz, uuid) from public;
grant execute on function public.schedule_overlay(timestamptz, timestamptz, uuid) to authenticated;
