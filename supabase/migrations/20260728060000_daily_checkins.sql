-- ============================================================================
-- Daily turn check-in + skill-aware rotation.
--
-- Being on the roster is no longer enough to receive clients: a tech opts into
-- the rotation each day. That makes "who is actually here right now" explicit
-- instead of inferred, which is what the floor argues about.
-- ============================================================================

create table public.turn_checkins (
  id             uuid primary key default gen_random_uuid(),
  salon_id       uuid not null references public.salons (id) on delete cascade,
  tech_id        uuid not null references public.profiles (id) on delete cascade,
  -- Salon-local calendar day. Stored as a date so "today" is unambiguous.
  checkin_date   date not null default current_date,
  checked_in_at  timestamptz not null default now(),
  checked_in_by  uuid references public.profiles (id) on delete set null,
  -- Set when someone checks out (or is checked out); the row stays for audit.
  checked_out_at timestamptz,
  checked_out_by uuid references public.profiles (id) on delete set null,

  unique (tech_id, checkin_date)
);

create index turn_checkins_day_idx on public.turn_checkins (salon_id, checkin_date);
create index turn_checkins_active_idx
  on public.turn_checkins (salon_id, checkin_date)
  where checked_out_at is null;

alter table public.turn_checkins enable row level security;

-- Who is on the floor today is shared knowledge.
create policy "salon members can view check-ins"
  on public.turn_checkins for select
  to authenticated
  using (salon_id = public.current_salon_id());

create policy "techs check themselves in, front desk checks anyone in"
  on public.turn_checkins for insert
  to authenticated
  with check (
    salon_id = public.current_salon_id()
    and (tech_id = auth.uid() or public.can_manage_floor())
  );

create policy "techs update their own check-in, front desk updates any"
  on public.turn_checkins for update
  to authenticated
  using (
    salon_id = public.current_salon_id()
    and (tech_id = auth.uid() or public.can_manage_floor())
  )
  with check (salon_id = public.current_salon_id());

create policy "front desk can delete check-ins"
  on public.turn_checkins for delete
  to authenticated
  using (salon_id = public.current_salon_id() and public.can_manage_floor());

grant select, insert, update, delete on public.turn_checkins to authenticated;

alter publication supabase_realtime add table public.turn_checkins;

-- ----------------------------------------------------------------------------
-- Check in / out.
--
-- Re-checking in the same day reopens the existing row rather than creating a
-- second one, so a mis-tap doesn't fork the day's record.
-- ----------------------------------------------------------------------------
create or replace function public.check_in_for_turns(p_tech_id uuid default null)
returns public.turn_checkins
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tech   uuid := coalesce(p_tech_id, auth.uid());
  v_salon  uuid := public.current_salon_id();
  v_row    public.turn_checkins;
begin
  if v_tech is null or v_salon is null then
    raise exception 'You must be signed in.' using errcode = 'insufficient_privilege';
  end if;

  if v_tech <> auth.uid() and not public.can_manage_floor() then
    raise exception 'Only the front desk can check someone else in' using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_tech and salon_id = v_salon and is_active
  ) then
    raise exception 'That tech is not on this salon''s active roster' using errcode = 'check_violation';
  end if;

  insert into public.turn_checkins (salon_id, tech_id, checkin_date, checked_in_by)
  values (v_salon, v_tech, current_date, auth.uid())
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
  if v_tech <> auth.uid() and not public.can_manage_floor() then
    raise exception 'Only the front desk can check someone else out' using errcode = 'insufficient_privilege';
  end if;

  update public.turn_checkins
  set checked_out_at = now(),
      checked_out_by = auth.uid()
  where tech_id = v_tech
    and checkin_date = current_date
    and salon_id = public.current_salon_id()
  returning * into v_row;

  if not found then
    raise exception 'They are not checked in today' using errcode = 'no_data_found';
  end if;

  return v_row;
end;
$$;

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
      and checkin_date = current_date
      and checked_out_at is null
  );
$$;

revoke all on function public.check_in_for_turns(uuid) from public;
revoke all on function public.check_out_of_turns(uuid) from public;
revoke all on function public.am_i_checked_in() from public;
grant execute on function public.check_in_for_turns(uuid) to authenticated;
grant execute on function public.check_out_of_turns(uuid) to authenticated;
grant execute on function public.am_i_checked_in() to authenticated;

-- ----------------------------------------------------------------------------
-- The rotation board, now day-aware and skill-aware.
--
-- Returns every active tech so the floor can see the whole roster, but only
-- techs checked in today get a `queue_position` — they are the day's queue.
-- `has_skills` reports whether they can take the service being matched, when
-- `p_required_skills` is supplied.
-- ----------------------------------------------------------------------------
drop function if exists public.turn_queue(uuid);

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
           ) as is_checked_in
    from public.profiles p, salon s
    where p.salon_id = s.id
      and p.role = 'tech'
      and p.is_active
      -- Callers may only inspect their own salon's board.
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
      t.id, t.full_name, t.last_turn_at, t.created_at, t.skills, t.is_checked_in,
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
    id,
    full_name,
    last_turn_at,
    is_busy,
    is_checked_in,
    has_skills,
    skills,
    waiting_jobs,
    jobs_today,
    case
      when is_checked_in then
        (row_number() over (
          partition by is_checked_in
          order by is_busy, last_turn_at asc nulls first, created_at asc
        ))::int
    end
  from scored
  order by
    is_checked_in desc,
    is_busy,
    last_turn_at asc nulls first,
    created_at asc;
$$;

-- ----------------------------------------------------------------------------
-- Who takes the next client?
--
-- Checked in today, free, has every required skill, oldest turn first. Returns
-- null when nobody qualifies — the caller leaves the job unassigned rather
-- than handing it to someone who can't do the work.
-- ----------------------------------------------------------------------------
drop function if exists public.suggest_next_tech(uuid);

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
-- Skip now respects skills: the client moves to the next tech who can
-- actually do the service, not merely the next body in line.
-- ----------------------------------------------------------------------------
create or replace function public.skip_job(p_job_id uuid)
returns public.jobs
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_job  public.jobs;
  v_next uuid;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job not found' using errcode = 'no_data_found';
  end if;

  if v_job.salon_id is distinct from public.current_salon_id() then
    raise exception 'Not authorized for this salon' using errcode = 'insufficient_privilege';
  end if;

  if not public.can_manage_floor() and v_job.tech_id is distinct from auth.uid() then
    raise exception 'You can only pass on your own client' using errcode = 'insufficient_privilege';
  end if;

  if v_job.status <> 'waiting' then
    raise exception 'Only a waiting client can be passed on' using errcode = 'check_violation';
  end if;

  -- Passing costs you your place.
  if v_job.tech_id is not null then
    update public.profiles set last_turn_at = now() where id = v_job.tech_id;
  end if;

  v_next := public.suggest_next_tech(v_job.salon_id, v_job.required_skills, v_job.tech_id);

  update public.jobs set tech_id = v_next where id = p_job_id returning * into v_job;
  return v_job;
end;
$$;

-- Starting a job requires the skill, and being checked in for the day.
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

  if not public.can_manage_floor() and v_tech is distinct from auth.uid() then
    raise exception 'Only the front desk can start a job for another tech' using errcode = 'insufficient_privilege';
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

  -- A tech has to be on today's rotation to take a client.
  if not exists (
    select 1 from public.turn_checkins
    where tech_id = v_tech and checkin_date = current_date and checked_out_at is null
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
  set tech_id = v_tech, status = 'in_progress', started_at = now()
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

-- Checking an appointment in matches on the booked service's skills.
create or replace function public.check_in_appointment(p_appointment_id uuid)
returns public.jobs
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_appt   public.appointments;
  v_job    public.jobs;
  v_skills public.skill[] := '{}';
  v_price  numeric(10, 2);
  v_name   text;
begin
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'Appointment not found' using errcode = 'no_data_found';
  end if;

  if v_appt.salon_id is distinct from public.current_salon_id() then
    raise exception 'Not authorized for this salon' using errcode = 'insufficient_privilege';
  end if;

  if v_appt.status <> 'scheduled' then
    raise exception 'Appointment is already %', v_appt.status using errcode = 'check_violation';
  end if;

  if v_appt.service_id is not null then
    select required_skills, price, name into v_skills, v_price, v_name
    from public.services where id = v_appt.service_id;
  end if;

  insert into public.jobs (
    salon_id, customer_id, tech_id, appointment_id, service_id, required_skills,
    type, status, service_name, notes
  )
  values (
    v_appt.salon_id,
    v_appt.customer_id,
    -- The booked tech keeps their client; otherwise the rotation matches one.
    coalesce(v_appt.tech_id, public.suggest_next_tech(v_appt.salon_id, coalesce(v_skills, '{}'))),
    v_appt.id,
    v_appt.service_id,
    coalesce(v_skills, '{}'),
    'appointment',
    'waiting',
    coalesce(v_name, v_appt.service_name),
    v_appt.notes
  )
  returning * into v_job;

  -- Seed the checkout line item from the booking.
  if v_appt.service_id is not null then
    insert into public.job_services (salon_id, job_id, service_id, name, price)
    values (v_appt.salon_id, v_job.id, v_appt.service_id, coalesce(v_name, v_appt.service_name), coalesce(v_price, 0));
  end if;

  update public.appointments set status = 'checked_in' where id = p_appointment_id;

  return v_job;
end;
$$;
