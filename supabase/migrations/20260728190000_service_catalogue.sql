-- ============================================================================
-- A menu with categories, and skills that inherit from them.
--
-- Two problems, one cause. The menu was a flat list, which stops working the
-- moment a salon has thirty items across five families. And every service had
-- to spell out its own skills, so "VIP Manicure" was only staffable if someone
-- remembered to type `manicure` on it — forget, and the rotation quietly
-- refuses to offer it to anyone.
--
-- ---------------------------------------------------------------------------
-- The inheritance rule
-- ---------------------------------------------------------------------------
--   effective skills = the category's base skill  ∪  whatever is spelled out
--
-- A union, not a replacement. That is what makes the requested behaviour fall
-- out for free:
--
--   Manicure       category manicure, nothing spelled out  → {manicure}
--   VIP Manicure   category manicure, nothing spelled out  → {manicure}
--   Gel manicure   category manicure, spells out {gel}     → {manicure, gel}
--
-- So a manager only ever types the *extra* requirement, never the obvious one,
-- and an upgraded variant is staffable by anyone who can do the base service
-- unless someone deliberately made it stricter.
--
-- Enhancements and add-ons have no base skill on purpose: acrylic, gel and dip
-- are genuinely different hands, and giving that family a shared base would let
-- the rotation hand an acrylic full set to someone who only does dip.
-- ============================================================================

create type public.service_category as enum (
  'manicure',
  'pedicure',
  'enhancement',
  'wax',
  'addon'
);

alter table public.services
  add column category public.service_category;

-- ----------------------------------------------------------------------------
-- The base skill each category implies. IMMUTABLE so it can be used in indexes
-- and generated expressions later without a rewrite.
-- ----------------------------------------------------------------------------
create or replace function public.category_base_skills(p_category public.service_category)
returns public.skill[]
language sql
immutable
as $$
  select case p_category
    when 'manicure' then array['manicure']::public.skill[]
    when 'pedicure' then array['pedicure']::public.skill[]
    when 'wax'      then array['waxing']::public.skill[]
    -- enhancement and addon deliberately have none: see the header.
    else '{}'::public.skill[]
  end;
$$;

create or replace function public.effective_service_skills(
  p_category public.service_category,
  p_required public.skill[]
)
returns public.skill[]
language sql
immutable
as $$
  select coalesce(
    (select array_agg(distinct s order by s)
     from (
       select unnest(public.category_base_skills(p_category)) as s
       union
       select unnest(coalesce(p_required, '{}'::public.skill[]))
     ) merged(s)),
    '{}'::public.skill[]
  );
$$;

-- ----------------------------------------------------------------------------
-- Backfill.
--
-- Categorising by name is a guess, so it is arranged to be a *safe* guess: the
-- effective skill set of every existing service must come out identical to what
-- it was, or the rotation's behaviour changes underneath the salon. Anything
-- unmatched lands in add-ons, where it is visible and one tap from correct.
-- ----------------------------------------------------------------------------
update public.services
   set category = case
     when name ~* '(pedicure|toe)'                              then 'pedicure'
     when name ~* '(wax|brow|lip)'                              then 'wax'
     when name ~* '(acrylic|dip|full set|fill|extension|tip)'   then 'enhancement'
     when name ~* '(manicure|polish change|shellac)'            then 'manicure'
     else 'addon'
   end::public.service_category;

alter table public.services
  alter column category set default 'addon',
  alter column category set not null;

-- Now that a category carries the base skill, spelling it out again is noise.
-- Clearing it makes the editor honest: an empty list means "inherits".
update public.services
   set required_skills = (
     select coalesce(array_agg(distinct s order by s), '{}')::public.skill[]
     from unnest(required_skills) s
     where s <> all (public.category_base_skills(category))
   );

create index services_category_idx
  on public.services (salon_id, category, sort_order, name);

-- ----------------------------------------------------------------------------
-- The menu, grouped and resolved.
--
-- Returns the effective skills alongside the spelled-out ones so the editor can
-- show "Manicure (inherited) + Gel" rather than making the manager work it out.
-- ----------------------------------------------------------------------------
create or replace function public.service_menu(p_include_inactive boolean default false)
returns table (
  id               uuid,
  name             text,
  category         public.service_category,
  price            numeric,
  duration_minutes integer,
  required_skills  public.skill[],
  effective_skills public.skill[],
  is_active        boolean,
  sort_order       integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.name,
    s.category,
    s.price,
    s.duration_minutes,
    s.required_skills,
    public.effective_service_skills(s.category, s.required_skills),
    s.is_active,
    s.sort_order
  from public.services s
  where s.salon_id = public.current_salon_id()
    and (p_include_inactive or s.is_active)
  order by s.category, s.sort_order, s.name;
$$;

revoke all on function public.service_menu(boolean) from public;
grant execute on function public.service_menu(boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- Who can actually do a given service, resolved through the same rule.
--
-- The booking form and the assign controls both need this, and computing it in
-- two places is how they come to disagree.
-- ----------------------------------------------------------------------------
create or replace function public.techs_for_service(p_service_id uuid)
returns table (
  tech_id   uuid,
  full_name text,
  eligible  boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with needed as (
    select public.effective_service_skills(s.category, s.required_skills) as skills
    from public.services s
    where s.id = p_service_id and s.salon_id = public.current_salon_id()
  )
  select
    p.id,
    p.full_name,
    coalesce(p.skills @> n.skills, false)
  from public.profiles p
  cross join needed n
  where p.salon_id = public.current_salon_id()
    and p.role::text = 'tech'
    and p.is_active
  order by (p.skills @> n.skills) desc, p.full_name;
$$;

revoke all on function public.techs_for_service(uuid) from public;
grant execute on function public.techs_for_service(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Create or update a menu item.
--
-- Replaces the ad-hoc upsert in the app so category, price, skills and the
-- active flag all move together, and so "which skills does this really need?"
-- has one answer.
-- ----------------------------------------------------------------------------
create or replace function public.save_service(
  p_id         uuid,
  p_name       text,
  p_category   public.service_category,
  p_price      numeric,
  p_minutes    integer,
  p_skills     public.skill[],
  p_is_active  boolean,
  p_sort_order integer default null
)
returns public.services
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row  public.services;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if not public.is_manager() then
    raise exception 'Only a manager can change the menu'
      using errcode = 'insufficient_privilege';
  end if;

  if v_name is null then
    raise exception 'A service needs a name' using errcode = 'check_violation';
  end if;

  if p_price is null or p_price < 0 then
    raise exception 'A price cannot be negative' using errcode = 'check_violation';
  end if;

  -- Storing the base skill again would be redundant, and would then survive a
  -- later category change as a stale requirement nobody typed.
  declare
    v_extra public.skill[] := coalesce(
      (select array_agg(distinct s order by s)
       from unnest(coalesce(p_skills, '{}'::public.skill[])) s
       where s <> all (public.category_base_skills(p_category))),
      '{}'::public.skill[]
    );
  begin
    if p_id is null then
      insert into public.services
        (salon_id, name, category, price, duration_minutes, required_skills, is_active, sort_order)
      values
        (public.current_salon_id(), v_name, p_category, p_price, p_minutes, v_extra,
         coalesce(p_is_active, true), coalesce(p_sort_order, 0))
      returning * into v_row;
    else
      update public.services
         set name             = v_name,
             category         = p_category,
             price            = p_price,
             duration_minutes = p_minutes,
             required_skills  = v_extra,
             is_active        = coalesce(p_is_active, is_active),
             sort_order       = coalesce(p_sort_order, sort_order),
             updated_at       = now()
       where id = p_id and salon_id = public.current_salon_id()
      returning * into v_row;

      if not found then
        raise exception 'That service no longer exists' using errcode = 'no_data_found';
      end if;
    end if;
  end;

  return v_row;
exception when unique_violation then
  raise exception 'There is already a service called %', v_name using errcode = 'unique_violation';
end;
$$;

revoke all on function public.save_service(uuid, text, public.service_category, numeric, integer, public.skill[], boolean, integer) from public;
grant execute on function public.save_service(uuid, text, public.service_category, numeric, integer, public.skill[], boolean, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- New salons get a categorised starter menu.
-- ----------------------------------------------------------------------------
-- Returns the row count, matching the original signature — a trigger on
-- `salons` already calls this, and changing the return type would need the
-- function dropped and the trigger rebuilt for no gain.
create or replace function public.seed_default_services(p_salon_id uuid)
returns integer
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.services
    (salon_id, name, category, price, duration_minutes, required_skills, sort_order)
  select p_salon_id, v.name, v.category::public.service_category, v.price, v.minutes,
         v.skills, v.sort_order
  from (values
    ('Manicure',             'manicure',    25.00,  30, '{}'::public.skill[],                 10),
    ('Gel manicure',         'manicure',    40.00,  45, array['gel']::public.skill[],         20),
    ('Polish change',        'manicure',    15.00,  20, '{}'::public.skill[],                 30),
    ('Pedicure',             'pedicure',    40.00,  45, '{}'::public.skill[],                 10),
    ('Gel pedicure',         'pedicure',    55.00,  60, array['gel']::public.skill[],         20),
    ('Full set acrylic',     'enhancement', 65.00,  75, array['acrylic']::public.skill[],     10),
    ('Acrylic fill',         'enhancement', 45.00,  60, array['acrylic']::public.skill[],     20),
    ('Dip powder',           'enhancement', 50.00,  60, array['dip']::public.skill[],         30),
    ('Eyebrow wax',          'wax',         15.00,  15, '{}'::public.skill[],                 10),
    ('Lip wax',              'wax',         10.00,  10, '{}'::public.skill[],                 20),
    ('Nail art (per nail)',  'addon',        5.00,  10, array['nail_art']::public.skill[],    10),
    ('Removal',              'addon',       15.00,  20, '{}'::public.skill[],                 20),
    ('French tips',          'addon',       10.00,  15, '{}'::public.skill[],                 30)
  ) as v(name, category, price, minutes, skills, sort_order)
  on conflict (salon_id, name) do nothing
  returning 1;
$$;

-- ----------------------------------------------------------------------------
-- Jobs snapshot the *effective* skills.
--
-- `jobs.required_skills` is a snapshot taken at check-in so that editing the
-- menu never rewrites what a past job needed. It was being copied straight
-- from `services.required_skills`, which now holds only the extras — so the
-- base skill has to be resolved in at the moment of copying.
-- ----------------------------------------------------------------------------
create or replace function public.snapshot_job_skills()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.services;
begin
  if new.service_id is null then
    return new;
  end if;

  select * into v_service from public.services where id = new.service_id;
  if not found then
    return new;
  end if;

  -- Only fill in what the caller left empty: an explicit list on the job is a
  -- deliberate override and must survive.
  if coalesce(cardinality(new.required_skills), 0) = 0 then
    new.required_skills :=
      public.effective_service_skills(v_service.category, v_service.required_skills);
  end if;

  return new;
end;
$$;

drop trigger if exists jobs_snapshot_skills on public.jobs;
create trigger jobs_snapshot_skills
  before insert on public.jobs
  for each row execute function public.snapshot_job_skills();
