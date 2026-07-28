-- ============================================================================
-- Service menu + the skill vocabulary that connects services to technicians.
--
-- `skill` is the shared language between the two: a service declares which
-- skills it needs, a tech declares which they have, and the rotation matches
-- them. Keeping it a single enum (rather than a join table on both sides)
-- keeps the matching a plain array containment test.
-- ============================================================================

create type public.skill as enum (
  'manicure',
  'pedicure',
  'gel',
  'acrylic',
  'dip',
  'nail_art',
  'waxing',
  'lash'
);

-- ----------------------------------------------------------------------------
-- Services — the salon's price list.
-- ----------------------------------------------------------------------------
create table public.services (
  id               uuid primary key default gen_random_uuid(),
  salon_id         uuid not null references public.salons (id) on delete cascade,
  name             text not null check (char_length(trim(name)) between 1 and 120),
  price            numeric(10, 2) not null default 0 check (price >= 0),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 600),
  -- Every skill listed here is required; a tech must have all of them.
  required_skills  public.skill[] not null default '{}',
  is_active        boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (salon_id, name)
);

create index services_salon_idx on public.services (salon_id, sort_order, name);
create index services_active_idx on public.services (salon_id) where is_active;

create trigger services_touch_updated_at
  before update on public.services
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Technician skills live on the profile — one row per tech already exists,
-- so a join table would buy nothing.
-- ----------------------------------------------------------------------------
alter table public.profiles add column skills public.skill[] not null default '{}';

-- ----------------------------------------------------------------------------
-- Jobs and appointments remember what the work needs and what it costs.
-- `required_skills` is copied onto the job so re-assignment still matches
-- correctly even if the service is edited or deleted later.
-- ----------------------------------------------------------------------------
alter table public.jobs add column service_id uuid references public.services (id) on delete set null;
alter table public.jobs add column required_skills public.skill[] not null default '{}';

alter table public.appointments add column service_id uuid references public.services (id) on delete set null;

-- ----------------------------------------------------------------------------
-- Checkout line items. A finished client may have had several services.
-- Name and price are snapshotted so history doesn't change when the menu does.
-- ----------------------------------------------------------------------------
create table public.job_services (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references public.salons (id) on delete cascade,
  job_id      uuid not null references public.jobs (id) on delete cascade,
  service_id  uuid references public.services (id) on delete set null,
  name        text not null,
  price       numeric(10, 2) not null default 0 check (price >= 0),
  quantity    integer not null default 1 check (quantity > 0),
  created_at  timestamptz not null default now()
);

create index job_services_job_idx on public.job_services (job_id);
create index job_services_salon_idx on public.job_services (salon_id, created_at desc);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.services enable row level security;
alter table public.job_services enable row level security;

-- Everyone in the salon reads the menu — techs need prices and skill labels.
create policy "salon members can view services"
  on public.services for select
  to authenticated
  using (salon_id = public.current_salon_id());

-- The price list is a manager decision.
create policy "managers can add services"
  on public.services for insert
  to authenticated
  with check (salon_id = public.current_salon_id() and public.is_manager());

create policy "managers can update services"
  on public.services for update
  to authenticated
  using (salon_id = public.current_salon_id() and public.is_manager())
  with check (salon_id = public.current_salon_id() and public.is_manager());

create policy "managers can delete services"
  on public.services for delete
  to authenticated
  using (salon_id = public.current_salon_id() and public.is_manager());

-- Line items follow the job they belong to.
create policy "front desk can view job services"
  on public.job_services for select
  to authenticated
  using (salon_id = public.current_salon_id() and public.can_manage_floor());

create policy "techs can view line items on their own jobs"
  on public.job_services for select
  to authenticated
  using (
    salon_id = public.current_salon_id()
    and exists (select 1 from public.jobs j where j.id = job_id and j.tech_id = auth.uid())
  );

create policy "front desk can manage job services"
  on public.job_services for insert
  to authenticated
  with check (salon_id = public.current_salon_id() and public.can_manage_floor());

create policy "front desk can update job services"
  on public.job_services for update
  to authenticated
  using (salon_id = public.current_salon_id() and public.can_manage_floor())
  with check (salon_id = public.current_salon_id() and public.can_manage_floor());

create policy "front desk can delete job services"
  on public.job_services for delete
  to authenticated
  using (salon_id = public.current_salon_id() and public.can_manage_floor());

grant select, insert, update, delete on public.services, public.job_services to authenticated;

alter publication supabase_realtime add table public.services;
alter publication supabase_realtime add table public.job_services;

-- ----------------------------------------------------------------------------
-- A tech maintains their own skill list; managers can correct anyone's.
-- Kept as an RPC so the `profiles` update policy doesn't have to allow techs
-- to write arbitrary columns on their own row.
-- ----------------------------------------------------------------------------
create or replace function public.set_my_skills(p_skills public.skill[])
returns public.profiles
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = 'insufficient_privilege';
  end if;

  update public.profiles
  set skills = coalesce(p_skills, '{}')
  where id = auth.uid()
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.set_tech_skills(p_tech_id uuid, p_skills public.skill[])
returns public.profiles
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_manager() then
    raise exception 'Managers only' using errcode = 'insufficient_privilege';
  end if;

  update public.profiles
  set skills = coalesce(p_skills, '{}')
  where id = p_tech_id and salon_id = public.current_salon_id()
  returning * into v_profile;

  if not found then
    raise exception 'That tech is not on this salon''s roster' using errcode = 'no_data_found';
  end if;

  return v_profile;
end;
$$;

revoke all on function public.set_my_skills(public.skill[]) from public;
revoke all on function public.set_tech_skills(uuid, public.skill[]) from public;
grant execute on function public.set_my_skills(public.skill[]) to authenticated;
grant execute on function public.set_tech_skills(uuid, public.skill[]) to authenticated;

-- ----------------------------------------------------------------------------
-- Starter menu, so the price list isn't an empty screen on day one.
-- Managers edit or delete these freely.
--
-- Driven by a trigger on `salons` rather than a one-off INSERT: a plain seed
-- statement only covers salons that exist when the migration runs, leaving
-- every salon created afterwards with no menu.
-- ----------------------------------------------------------------------------
create or replace function public.seed_default_services(p_salon_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.services (salon_id, name, price, duration_minutes, required_skills, sort_order)
  select p_salon_id, v.name, v.price, v.minutes, v.skills, v.sort_order
  from (values
    ('Manicure',            25.00,  30, array['manicure']::public.skill[],         10),
    ('Gel manicure',        40.00,  45, array['manicure','gel']::public.skill[],   20),
    ('Pedicure',            40.00,  45, array['pedicure']::public.skill[],         30),
    ('Gel pedicure',        55.00,  60, array['pedicure','gel']::public.skill[],   40),
    ('Full set acrylic',    65.00,  75, array['acrylic']::public.skill[],          50),
    ('Acrylic fill',        45.00,  60, array['acrylic']::public.skill[],          60),
    ('Dip powder',          50.00,  60, array['dip']::public.skill[],              70),
    ('Nail art (per nail)',  5.00,  10, array['nail_art']::public.skill[],         80),
    ('Polish change',       15.00,  20, array['manicure']::public.skill[],         90),
    ('Removal',             15.00,  20, '{}'::public.skill[],                     100)
  ) as v(name, price, minutes, skills, sort_order)
  on conflict (salon_id, name) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.seed_default_services(uuid) from public;
grant execute on function public.seed_default_services(uuid) to authenticated;

create or replace function public.seed_services_for_new_salon()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_services(new.id);
  return new;
end;
$$;

create trigger salons_seed_services
  after insert on public.salons
  for each row execute function public.seed_services_for_new_salon();

-- Backfill any salon that already exists.
select public.seed_default_services(id) from public.salons;
