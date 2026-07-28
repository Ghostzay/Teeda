-- ============================================================================
-- Teeda — Nail Salon Management Platform
-- V1 schema: salons, profiles, customers, jobs, appointments
-- Includes: enums, indexes, RLS, turn-rotation logic, realtime, storage.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type public.user_role as enum ('manager', 'tech');
create type public.job_type as enum ('walk-in', 'appointment');
create type public.job_status as enum ('waiting', 'in_progress', 'completed', 'cancelled');
create type public.appointment_status as enum ('scheduled', 'checked_in', 'completed', 'cancelled');

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------
create table public.salons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 1 and 120),
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  salon_id      uuid not null references public.salons (id) on delete cascade,
  full_name     text not null check (char_length(trim(full_name)) between 1 and 120),
  role          public.user_role not null default 'tech',
  is_active     boolean not null default true,
  -- Anchor for fair rotation: the moment this tech last picked up a client.
  -- NULL = never taken a turn, which sorts first (fairest for new hires).
  last_turn_at  timestamptz,
  created_at    timestamptz not null default now()
);

create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references public.salons (id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 120),
  phone       text,
  notes       text,
  created_at  timestamptz not null default now()
);

create table public.appointments (
  id            uuid primary key default gen_random_uuid(),
  salon_id      uuid not null references public.salons (id) on delete cascade,
  customer_id   uuid not null references public.customers (id) on delete cascade,
  tech_id       uuid references public.profiles (id) on delete set null,
  scheduled_at  timestamptz not null,
  service_name  text not null check (char_length(trim(service_name)) between 1 and 120),
  notes         text,
  status        public.appointment_status not null default 'scheduled',
  created_at    timestamptz not null default now()
);

create table public.jobs (
  id              uuid primary key default gen_random_uuid(),
  salon_id        uuid not null references public.salons (id) on delete cascade,
  customer_id     uuid not null references public.customers (id) on delete cascade,
  tech_id         uuid references public.profiles (id) on delete set null,
  appointment_id  uuid references public.appointments (id) on delete set null,
  type            public.job_type not null default 'walk-in',
  status          public.job_status not null default 'waiting',
  service_name    text not null check (char_length(trim(service_name)) between 1 and 120),
  notes           text,
  photo_url       text,
  checked_in_at   timestamptz not null default now(),
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Timestamps must agree with the status they represent.
  constraint jobs_started_requires_ts check (status <> 'in_progress' or started_at is not null),
  constraint jobs_completed_requires_ts check (status <> 'completed' or completed_at is not null)
);

-- ----------------------------------------------------------------------------
-- Indexes — every list view and the turn query are covered.
-- ----------------------------------------------------------------------------
create index profiles_salon_id_idx on public.profiles (salon_id);
-- The turn-rotation lookup: active techs in a salon, oldest turn first.
create index profiles_turn_order_idx
  on public.profiles (salon_id, last_turn_at nulls first)
  where role = 'tech' and is_active;

create index customers_salon_id_idx on public.customers (salon_id, created_at desc);
create index customers_name_idx on public.customers (salon_id, lower(name));
create index customers_phone_idx on public.customers (salon_id, phone) where phone is not null;

create index jobs_salon_status_idx on public.jobs (salon_id, status, checked_in_at);
create index jobs_tech_idx on public.jobs (tech_id, status) where tech_id is not null;
create index jobs_customer_idx on public.jobs (customer_id, created_at desc);
create index jobs_salon_created_idx on public.jobs (salon_id, created_at desc);
-- A tech can only have one job in progress at a time.
create unique index jobs_one_active_per_tech_idx
  on public.jobs (tech_id)
  where status = 'in_progress' and tech_id is not null;

create index appointments_salon_time_idx on public.appointments (salon_id, scheduled_at);
create index appointments_tech_idx on public.appointments (tech_id, scheduled_at) where tech_id is not null;
create index appointments_customer_idx on public.appointments (customer_id, scheduled_at desc);

-- ----------------------------------------------------------------------------
-- Auth helpers
--
-- These are SECURITY DEFINER so RLS policies can read the caller's profile
-- without recursing back into the policies on `profiles` itself.
-- ----------------------------------------------------------------------------
create or replace function public.current_salon_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select salon_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'manager' and is_active
  );
$$;

revoke all on function public.current_salon_id() from public;
revoke all on function public.is_manager() from public;
grant execute on function public.current_salon_id() to authenticated;
grant execute on function public.is_manager() to authenticated;

-- ----------------------------------------------------------------------------
-- New user bootstrap
--
-- Two sign-up paths, both driven by auth metadata so no extra onboarding page
-- is needed and both survive email confirmation:
--   * salon_name present -> create the salon and make this user its manager
--   * salon_id present   -> join an existing salon (manager invited a tech)
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta          jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_salon_id    uuid;
  v_full_name   text := nullif(trim(coalesce(meta ->> 'full_name', '')), '');
  v_salon_name  text := nullif(trim(coalesce(meta ->> 'salon_name', '')), '');
  v_role        public.user_role;
begin
  if meta ->> 'salon_id' is not null then
    v_salon_id := (meta ->> 'salon_id')::uuid;
    v_role := coalesce(nullif(meta ->> 'role', '')::public.user_role, 'tech');
  elsif v_salon_name is not null then
    insert into public.salons (name) values (v_salon_name) returning id into v_salon_id;
    v_role := 'manager';
  else
    -- No salon context: leave the user without a profile. The app routes them
    -- to a "no salon" screen rather than silently creating an orphan salon.
    return new;
  end if;

  insert into public.profiles (id, salon_id, full_name, role)
  values (new.id, v_salon_id, coalesce(v_full_name, split_part(new.email, '@', 1)), v_role)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Attaching a trigger to `auth.users` requires elevated privileges. If this
-- role doesn't have them, don't take the rest of the migration down with it —
-- the app bootstraps salons through public.bootstrap_salon() as well.
do $$
begin
  begin
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  exception
    when others then
      raise notice
        'Could not attach the auth.users trigger (%). Signup falls back to public.bootstrap_salon().',
        sqlerrm;
  end;
end;
$$;

-- ----------------------------------------------------------------------------
-- Job triggers: keep updated_at honest and advance the turn clock.
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger jobs_touch_updated_at
  before update on public.jobs
  for each row execute function public.touch_updated_at();

-- The single source of truth for rotation fairness: the moment a tech actually
-- starts working a client, their turn clock resets. Putting this in a trigger
-- means it holds no matter which client, action, or SQL console did the update.
create or replace function public.sync_turn_on_start()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'in_progress'
     and new.tech_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'in_progress' or old.tech_id is distinct from new.tech_id)
  then
    new.started_at := coalesce(new.started_at, now());

    update public.profiles
    set last_turn_at = greatest(coalesce(last_turn_at, new.started_at), new.started_at)
    where id = new.tech_id;
  end if;

  if new.status = 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
  end if;

  return new;
end;
$$;

create trigger jobs_sync_turn
  before insert or update on public.jobs
  for each row execute function public.sync_turn_on_start();

-- ----------------------------------------------------------------------------
-- Turn logic (server side)
-- ----------------------------------------------------------------------------

-- Ordered rotation board. `is_busy` = currently mid-service.
-- Free techs come first, then oldest turn wins. Ties break on seniority.
create or replace function public.turn_queue(p_salon_id uuid default null)
returns table (
  tech_id       uuid,
  full_name     text,
  last_turn_at  timestamptz,
  is_busy       boolean,
  waiting_jobs  integer,
  jobs_today    integer,
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
    select p.id, p.full_name, p.last_turn_at, p.created_at
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
  )
  select
    t.id,
    t.full_name,
    t.last_turn_at,
    coalesce(s.is_busy, false),
    coalesce(s.waiting_jobs, 0),
    coalesce(s.jobs_today, 0),
    (row_number() over (
      order by coalesce(s.is_busy, false), t.last_turn_at asc nulls first, t.created_at asc
    ))::int
  from techs t
  left join stats s on s.id = t.id
  order by coalesce(s.is_busy, false), t.last_turn_at asc nulls first, t.created_at asc;
$$;

-- Who should take the next client? Free first, then oldest last_turn_at.
create or replace function public.suggest_next_tech(p_salon_id uuid default null)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tech_id
  from public.turn_queue(p_salon_id)
  where not is_busy
  order by queue_position
  limit 1;
$$;

-- Assign (or re-assign / unassign with null) a job's tech. Managers only,
-- except a tech may claim an unassigned waiting job for themselves.
create or replace function public.assign_job(p_job_id uuid, p_tech_id uuid)
returns public.jobs
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_job public.jobs;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job not found' using errcode = 'no_data_found';
  end if;

  if v_job.salon_id is distinct from public.current_salon_id() then
    raise exception 'Not authorized for this salon' using errcode = 'insufficient_privilege';
  end if;

  if not public.is_manager()
     and not (v_job.tech_id is null and p_tech_id = auth.uid() and v_job.status = 'waiting')
  then
    raise exception 'Only a manager can assign this job' using errcode = 'insufficient_privilege';
  end if;

  if p_tech_id is not null and not exists (
    select 1 from public.profiles
    where id = p_tech_id and salon_id = v_job.salon_id and is_active
  ) then
    raise exception 'Tech is not an active member of this salon' using errcode = 'check_violation';
  end if;

  update public.jobs set tech_id = p_tech_id where id = p_job_id returning * into v_job;
  return v_job;
end;
$$;

-- Start a job. Assigns the caller if the job is unclaimed, stamps started_at,
-- and (via the trigger) advances that tech's turn clock.
create or replace function public.start_job(p_job_id uuid, p_tech_id uuid default null)
returns public.jobs
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_job  public.jobs;
  v_tech uuid;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job not found' using errcode = 'no_data_found';
  end if;

  if v_job.salon_id is distinct from public.current_salon_id() then
    raise exception 'Not authorized for this salon' using errcode = 'insufficient_privilege';
  end if;

  v_tech := coalesce(p_tech_id, v_job.tech_id, auth.uid());

  if not public.is_manager() and v_tech is distinct from auth.uid() then
    raise exception 'Only a manager can start a job for another tech' using errcode = 'insufficient_privilege';
  end if;

  if v_job.status <> 'waiting' then
    raise exception 'Job is already %', v_job.status using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.jobs
    where tech_id = v_tech and status = 'in_progress' and id <> p_job_id
  ) then
    raise exception 'That tech already has a client in progress' using errcode = 'unique_violation';
  end if;

  update public.jobs
  set tech_id = v_tech, status = 'in_progress', started_at = now()
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

-- Complete a job. Also closes out the linked appointment, if any.
create or replace function public.complete_job(p_job_id uuid)
returns public.jobs
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_job public.jobs;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job not found' using errcode = 'no_data_found';
  end if;

  if v_job.salon_id is distinct from public.current_salon_id() then
    raise exception 'Not authorized for this salon' using errcode = 'insufficient_privilege';
  end if;

  if not public.is_manager() and v_job.tech_id is distinct from auth.uid() then
    raise exception 'Only a manager can complete another tech''s job' using errcode = 'insufficient_privilege';
  end if;

  if v_job.status not in ('waiting', 'in_progress') then
    raise exception 'Job is already %', v_job.status using errcode = 'check_violation';
  end if;

  update public.jobs
  set status = 'completed',
      completed_at = now(),
      started_at = coalesce(started_at, now())
  where id = p_job_id
  returning * into v_job;

  if v_job.appointment_id is not null then
    update public.appointments set status = 'completed' where id = v_job.appointment_id;
  end if;

  return v_job;
end;
$$;

-- Check an appointment in: creates the waiting job that enters the queue.
create or replace function public.check_in_appointment(p_appointment_id uuid)
returns public.jobs
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_appt public.appointments;
  v_job  public.jobs;
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

  insert into public.jobs (
    salon_id, customer_id, tech_id, appointment_id, type, status, service_name, notes
  )
  values (
    v_appt.salon_id,
    v_appt.customer_id,
    -- Booked tech keeps their client; otherwise the rotation picks one.
    coalesce(v_appt.tech_id, public.suggest_next_tech(v_appt.salon_id)),
    v_appt.id,
    'appointment',
    'waiting',
    v_appt.service_name,
    v_appt.notes
  )
  returning * into v_job;

  update public.appointments set status = 'checked_in' where id = p_appointment_id;

  return v_job;
end;
$$;

-- Manager-only: reset a tech's rotation clock (e.g. after a long break).
create or replace function public.reset_turn(p_tech_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_manager() then
    raise exception 'Managers only' using errcode = 'insufficient_privilege';
  end if;

  update public.profiles
  set last_turn_at = now()
  where id = p_tech_id and salon_id = public.current_salon_id();
end;
$$;

revoke all on function public.turn_queue(uuid) from public;
revoke all on function public.suggest_next_tech(uuid) from public;
revoke all on function public.assign_job(uuid, uuid) from public;
revoke all on function public.start_job(uuid, uuid) from public;
revoke all on function public.complete_job(uuid) from public;
revoke all on function public.check_in_appointment(uuid) from public;
revoke all on function public.reset_turn(uuid) from public;

grant execute on function public.turn_queue(uuid) to authenticated;
grant execute on function public.suggest_next_tech(uuid) to authenticated;
grant execute on function public.assign_job(uuid, uuid) to authenticated;
grant execute on function public.start_job(uuid, uuid) to authenticated;
grant execute on function public.complete_job(uuid) to authenticated;
grant execute on function public.check_in_appointment(uuid) to authenticated;
grant execute on function public.reset_turn(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Row Level Security
--
-- Managers: full read/write within their own salon.
-- Techs:    their own jobs + the waiting queue; read-only on the roster
--           and customer records they need to serve a client.
-- ----------------------------------------------------------------------------
alter table public.salons       enable row level security;
alter table public.profiles     enable row level security;
alter table public.customers    enable row level security;
alter table public.jobs         enable row level security;
alter table public.appointments enable row level security;

-- salons ---------------------------------------------------------------------
create policy "salon members can view their salon"
  on public.salons for select
  to authenticated
  using (id = public.current_salon_id());

create policy "managers can update their salon"
  on public.salons for update
  to authenticated
  using (id = public.current_salon_id() and public.is_manager())
  with check (id = public.current_salon_id() and public.is_manager());

-- profiles -------------------------------------------------------------------
-- The whole roster is visible in-salon: the turn queue is a shared board.
create policy "salon members can view the roster"
  on public.profiles for select
  to authenticated
  using (salon_id = public.current_salon_id());

create policy "managers can add staff to their salon"
  on public.profiles for insert
  to authenticated
  with check (salon_id = public.current_salon_id() and public.is_manager());

create policy "managers can update staff in their salon"
  on public.profiles for update
  to authenticated
  using (salon_id = public.current_salon_id() and public.is_manager())
  with check (salon_id = public.current_salon_id() and public.is_manager());

create policy "users can update their own name"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and salon_id = public.current_salon_id());

create policy "managers can remove staff"
  on public.profiles for delete
  to authenticated
  using (
    salon_id = public.current_salon_id()
    and public.is_manager()
    and id <> auth.uid()
  );

-- customers ------------------------------------------------------------------
create policy "salon members can view customers"
  on public.customers for select
  to authenticated
  using (salon_id = public.current_salon_id());

-- Techs at the front desk check people in, so they may create customers.
create policy "salon members can add customers"
  on public.customers for insert
  to authenticated
  with check (salon_id = public.current_salon_id());

create policy "managers can update customers"
  on public.customers for update
  to authenticated
  using (salon_id = public.current_salon_id() and public.is_manager())
  with check (salon_id = public.current_salon_id() and public.is_manager());

create policy "managers can delete customers"
  on public.customers for delete
  to authenticated
  using (salon_id = public.current_salon_id() and public.is_manager());

-- jobs -----------------------------------------------------------------------
create policy "managers can view all salon jobs"
  on public.jobs for select
  to authenticated
  using (salon_id = public.current_salon_id() and public.is_manager());

-- A tech sees their own work plus the waiting queue they are rotating through.
create policy "techs can view their jobs and the queue"
  on public.jobs for select
  to authenticated
  using (
    salon_id = public.current_salon_id()
    and (tech_id = auth.uid() or status = 'waiting')
  );

create policy "salon members can create jobs"
  on public.jobs for insert
  to authenticated
  with check (salon_id = public.current_salon_id());

create policy "managers can update any salon job"
  on public.jobs for update
  to authenticated
  using (salon_id = public.current_salon_id() and public.is_manager())
  with check (salon_id = public.current_salon_id());

-- A tech may work their own job, or claim an unassigned one from the queue.
create policy "techs can update their own or unclaimed jobs"
  on public.jobs for update
  to authenticated
  using (
    salon_id = public.current_salon_id()
    and (tech_id = auth.uid() or (tech_id is null and status = 'waiting'))
  )
  with check (
    salon_id = public.current_salon_id()
    and tech_id = auth.uid()
  );

create policy "managers can delete jobs"
  on public.jobs for delete
  to authenticated
  using (salon_id = public.current_salon_id() and public.is_manager());

-- appointments ---------------------------------------------------------------
create policy "managers can view all salon appointments"
  on public.appointments for select
  to authenticated
  using (salon_id = public.current_salon_id() and public.is_manager());

create policy "techs can view their own appointments"
  on public.appointments for select
  to authenticated
  using (salon_id = public.current_salon_id() and tech_id = auth.uid());

create policy "managers can create appointments"
  on public.appointments for insert
  to authenticated
  with check (salon_id = public.current_salon_id() and public.is_manager());

create policy "managers can update appointments"
  on public.appointments for update
  to authenticated
  using (salon_id = public.current_salon_id() and public.is_manager())
  with check (salon_id = public.current_salon_id() and public.is_manager());

create policy "managers can delete appointments"
  on public.appointments for delete
  to authenticated
  using (salon_id = public.current_salon_id() and public.is_manager());

-- ----------------------------------------------------------------------------
-- Realtime — the queue board updates live on every device in the salon.
-- RLS is enforced on the replicated rows, so techs still only receive what
-- their policies allow.
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.jobs;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.appointments;

-- ----------------------------------------------------------------------------
-- Storage — nail art / reference photos attached to a job.
-- Objects are stored under `<salon_id>/<job_id>/<file>`, so the first path
-- segment is the tenant boundary.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', true)
on conflict (id) do nothing;

create policy "salon members can view job photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = public.current_salon_id()::text
  );

create policy "salon members can upload job photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = public.current_salon_id()::text
  );

create policy "managers can delete job photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = public.current_salon_id()::text
    and public.is_manager()
  );
