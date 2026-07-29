-- ============================================================================
-- Deeper profiles, for clients and for techs, plus the history behind them.
--
-- Both tables held a name and almost nothing else, so "who is this person and
-- what have we done for them?" had no answer in the product — the desk kept it
-- in their head or on paper.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Clients.
--
-- Contact details plus the two things that change how a service is delivered:
-- allergies, and what they had last time. Both are things a tech needs before
-- they start, not after.
-- ----------------------------------------------------------------------------
alter table public.customers
  add column email text,
  add column birthday date,
  add column preferred_tech_id uuid references public.profiles (id) on delete set null,
  add column allergies text,
  add column is_active boolean not null default true;

comment on column public.customers.preferred_tech_id is
  'Who they ask for. A preference, never a rule — the rotation still decides.';
comment on column public.customers.allergies is
  'Read before starting. Kept separate from notes so it cannot be lost in prose.';

create index customers_preferred_tech_idx
  on public.customers (preferred_tech_id)
  where preferred_tech_id is not null;

-- ----------------------------------------------------------------------------
-- Technicians.
--
-- Everything a manager currently keeps on a phone: how to reach them, who to
-- call if something happens, when they started, what they are good at in prose
-- rather than as an enum.
--
-- Deliberately NOT on `profiles`: RLS there is row-level and every salon member
-- can read the roster, so a phone number or an emergency contact stored on
-- `profiles` would be readable by everyone. Same reasoning as `tech_pay`.
-- ----------------------------------------------------------------------------
create table public.tech_profiles (
  tech_id            uuid primary key references public.profiles (id) on delete cascade,
  salon_id           uuid not null default public.current_salon_id()
                       references public.salons (id) on delete cascade,
  phone              text,
  email              text,
  started_on         date,
  pronouns           text,
  bio                text,
  specialties        text,
  certifications     text,
  emergency_contact  text,
  emergency_phone    text,
  manager_notes      text,
  updated_at         timestamptz not null default now()
);

comment on column public.tech_profiles.manager_notes is
  'Manager-only. Never shown to the tech, and the SELECT policy enforces that '
  'rather than the UI hiding a column it was still sent.';

create index tech_profiles_salon_idx on public.tech_profiles (salon_id);

alter table public.tech_profiles enable row level security;

-- A tech reads their own row; managers read anyone's in their salon. Admins are
-- deliberately excluded: this holds home phone numbers and next of kin, which
-- running the floor does not require.
create policy "own profile or manager"
  on public.tech_profiles for select
  to authenticated
  using (
    salon_id = public.current_salon_id()
    and (tech_id = auth.uid() or public.is_manager())
  );

create policy "managers write tech profiles"
  on public.tech_profiles for all
  to authenticated
  using (salon_id = public.current_salon_id() and public.is_manager())
  with check (salon_id = public.current_salon_id() and public.is_manager());

grant select, insert, update, delete on public.tech_profiles to authenticated;

-- ----------------------------------------------------------------------------
-- Save a tech profile.
--
-- Upsert, because "edit the profile" should work whether or not a row exists —
-- making the caller find out first is a round trip and a race.
-- ----------------------------------------------------------------------------
-- Every field is required, with no defaults, on purpose. This replaces the
-- whole row — that is what lets an emptied field actually clear — so a caller
-- that omits an argument would silently erase it. Without defaults, omitting
-- one is a compile error in the app instead of lost data in the salon.
create or replace function public.save_tech_profile(
  p_tech_id           uuid,
  p_phone             text,
  p_email             text,
  p_started_on        date,
  p_pronouns          text,
  p_bio               text,
  p_specialties       text,
  p_certifications    text,
  p_emergency_contact text,
  p_emergency_phone   text,
  p_manager_notes     text
)
returns public.tech_profiles
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.tech_profiles;
begin
  if not public.is_manager() then
    raise exception 'Only a manager can edit a team profile'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_tech_id and salon_id = public.current_salon_id()
  ) then
    raise exception 'That person is not on this salon''s roster'
      using errcode = 'no_data_found';
  end if;

  insert into public.tech_profiles as t (
    tech_id, salon_id, phone, email, started_on, pronouns, bio, specialties,
    certifications, emergency_contact, emergency_phone, manager_notes
  )
  values (
    p_tech_id, public.current_salon_id(),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_email, '')), ''),
    p_started_on,
    nullif(trim(coalesce(p_pronouns, '')), ''),
    nullif(trim(coalesce(p_bio, '')), ''),
    nullif(trim(coalesce(p_specialties, '')), ''),
    nullif(trim(coalesce(p_certifications, '')), ''),
    nullif(trim(coalesce(p_emergency_contact, '')), ''),
    nullif(trim(coalesce(p_emergency_phone, '')), ''),
    nullif(trim(coalesce(p_manager_notes, '')), '')
  )
  on conflict (tech_id) do update
    set phone             = excluded.phone,
        email             = excluded.email,
        started_on        = excluded.started_on,
        pronouns          = excluded.pronouns,
        bio               = excluded.bio,
        specialties       = excluded.specialties,
        certifications    = excluded.certifications,
        emergency_contact = excluded.emergency_contact,
        emergency_phone   = excluded.emergency_phone,
        manager_notes     = excluded.manager_notes,
        updated_at        = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.save_tech_profile(uuid, text, text, date, text, text, text, text, text, text, text) from public;
grant execute on function public.save_tech_profile(uuid, text, text, date, text, text, text, text, text, text, text) to authenticated;

-- ============================================================================
-- One client, everything about them.
--
-- Past and future in one call, ordered so the UI can split on `is_future`
-- rather than making two round trips that could disagree about "now".
-- ============================================================================
create or replace function public.client_history(p_customer_id uuid)
returns table (
  kind          text,
  id            uuid,
  at            timestamptz,
  service_name  text,
  tech_id       uuid,
  tech_name     text,
  status        text,
  notes         text,
  amount        numeric,
  tip           numeric,
  paid          boolean,
  is_future     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  -- Bookings, including ones still to come.
  select
    'appointment'::text,
    a.id,
    a.scheduled_at,
    a.service_name,
    a.tech_id,
    coalesce(p.full_name, 'Unassigned'),
    a.status::text,
    a.notes,
    0::numeric,
    0::numeric,
    false,
    (a.scheduled_at > now())
  from public.appointments a
  left join public.profiles p on p.id = a.tech_id
  where a.customer_id = p_customer_id
    and a.salon_id = public.current_salon_id()
    and public.can_manage_floor()

  union all

  -- Work actually done, with what it came to.
  select
    'job'::text,
    j.id,
    coalesce(j.completed_at, j.checked_in_at),
    j.service_name,
    j.tech_id,
    coalesce(p.full_name, 'Unassigned'),
    j.status::text,
    j.notes,
    coalesce(pay.service_amount, 0)::numeric,
    coalesce(pay.tip_amount, 0)::numeric,
    (pay.id is not null),
    false
  from public.jobs j
  left join public.profiles p on p.id = j.tech_id
  left join public.payments pay on pay.job_id = j.id
  where j.customer_id = p_customer_id
    and j.salon_id = public.current_salon_id()
    and j.status <> 'cancelled'
    and public.can_manage_floor()

  order by 3 desc;
$$;

revoke all on function public.client_history(uuid) from public;
grant execute on function public.client_history(uuid) to authenticated;

-- The headline numbers on a client's profile.
create or replace function public.client_summary(p_customer_id uuid)
returns table (
  visits         integer,
  lifetime_spend numeric,
  lifetime_tips  numeric,
  first_visit    timestamptz,
  last_visit     timestamptz,
  upcoming       integer,
  favourite_tech text,
  favourite_service text
)
language sql
stable
security definer
set search_path = public
as $$
  with done as (
    select j.*, pay.service_amount, pay.tip_amount
    from public.jobs j
    left join public.payments pay on pay.job_id = j.id
    where j.customer_id = p_customer_id
      and j.salon_id = public.current_salon_id()
      and j.status = 'completed'
      and public.can_manage_floor()
  )
  select
    (select count(*)::int from done),
    (select coalesce(sum(service_amount), 0)::numeric from done),
    (select coalesce(sum(tip_amount), 0)::numeric from done),
    (select min(completed_at) from done),
    (select max(completed_at) from done),
    (select count(*)::int from public.appointments a
      where a.customer_id = p_customer_id
        and a.salon_id = public.current_salon_id()
        and a.status = 'scheduled'
        and a.scheduled_at > now()),
    -- Who they see most, which is not always who they say they prefer.
    (select p.full_name from done d
      join public.profiles p on p.id = d.tech_id
      group by p.full_name order by count(*) desc, p.full_name limit 1),
    (select d.service_name from done d
      group by d.service_name order by count(*) desc, d.service_name limit 1);
$$;

revoke all on function public.client_summary(uuid) from public;
grant execute on function public.client_summary(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Update the extra client fields.
-- ----------------------------------------------------------------------------
create or replace function public.update_customer_details(
  p_id           uuid,
  p_email        text default null,
  p_birthday     date default null,
  p_preferred_tech_id uuid default null,
  p_allergies    text default null,
  p_clear_preferred boolean default false
)
returns public.customers
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.customers;
begin
  if not public.can_manage_floor() then
    raise exception 'Only the front desk can edit a client'
      using errcode = 'insufficient_privilege';
  end if;

  update public.customers
     set email        = nullif(trim(coalesce(p_email, '')), ''),
         birthday     = p_birthday,
         allergies    = nullif(trim(coalesce(p_allergies, '')), ''),
         preferred_tech_id = case when p_clear_preferred then null
                                  else coalesce(p_preferred_tech_id, preferred_tech_id) end
   where id = p_id and salon_id = public.current_salon_id()
  returning * into v_row;

  if not found then
    raise exception 'That client no longer exists' using errcode = 'no_data_found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.update_customer_details(uuid, text, date, uuid, text, boolean) from public;
grant execute on function public.update_customer_details(uuid, text, date, uuid, text, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- The team's skills, as one grid.
--
-- Managers keep asking "who can do acrylics on a Saturday?" and the answer was
-- spread across a dozen profile pages.
-- ----------------------------------------------------------------------------
create or replace function public.team_skills()
returns table (
  tech_id     uuid,
  full_name   text,
  is_active   boolean,
  skills      public.skill[],
  specialties text,
  jobs_30d    integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    p.is_active,
    p.skills,
    -- Only a manager sees the prose; the roster itself is shared knowledge.
    case when public.is_manager() then tp.specialties else null end,
    coalesce(recent.n, 0)::int
  from public.profiles p
  left join public.tech_profiles tp on tp.tech_id = p.id
  left join lateral (
    select count(*)::int as n
    from public.jobs j
    where j.tech_id = p.id
      and j.status = 'completed'
      and j.completed_at >= now() - interval '30 days'
  ) recent on true
  where p.salon_id = public.current_salon_id()
    and p.role::text = 'tech'
  order by p.is_active desc, p.full_name;
$$;

revoke all on function public.team_skills() from public;
grant execute on function public.team_skills() to authenticated;

-- ----------------------------------------------------------------------------
-- Editing skills, one tech or many.
--
-- "Everyone is certified on dip powder now" was a dozen visits to a dozen
-- profile pages, which is how skill lists go stale — and a stale skill list
-- silently changes who the rotation offers work to.
--
-- Add and remove in one call because a correction is usually both ("they do
-- gel now, not acrylic"), and doing it as two calls leaves a window where the
-- rotation sees a tech with neither.
--
-- p_tech_ids NULL means every active tech. That is a big hammer, so the app
-- asks for confirmation and names the count before calling it.
-- ----------------------------------------------------------------------------
create or replace function public.bulk_update_skills(
  p_tech_ids uuid[] default null,
  p_add      public.skill[] default '{}',
  p_remove   public.skill[] default '{}'
)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_changed integer;
begin
  if not public.is_manager() then
    raise exception 'Only a manager can change skills'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(cardinality(p_add), 0) = 0 and coalesce(cardinality(p_remove), 0) = 0 then
    raise exception 'Pick at least one skill to add or remove'
      using errcode = 'check_violation';
  end if;

  with target as (
    select id from public.profiles
    where salon_id = public.current_salon_id()
      and role::text = 'tech'
      and (p_tech_ids is null or id = any (p_tech_ids))
  ),
  updated as (
    update public.profiles p
       set skills = (
         -- Remove first, then add: asking for the same skill in both lists is
         -- a contradiction, and "add" is the more likely intent.
         select coalesce(array_agg(distinct s order by s), '{}')::public.skill[]
         from (
           select unnest(p.skills) as s
           except
           select unnest(coalesce(p_remove, '{}'::public.skill[]))
           union
           select unnest(coalesce(p_add, '{}'::public.skill[]))
         ) merged(s)
       )
     where p.id in (select id from target)
    returning 1
  )
  select count(*)::int into v_changed from updated;

  return v_changed;
end;
$$;

revoke all on function public.bulk_update_skills(uuid[], public.skill[], public.skill[]) from public;
grant execute on function public.bulk_update_skills(uuid[], public.skill[], public.skill[]) to authenticated;

-- ============================================================================
-- Deleting a team member, as opposed to deactivating one.
--
-- The foreign keys make this more dangerous than it looks. `jobs.tech_id` and
-- `payments.tech_id` are ON DELETE SET NULL, so removing a profile does not
-- fail — it quietly detaches every service they ever performed and every
-- payment they were ever owed. The rows survive, the attribution does not, and
-- a past pay period silently changes shape.
--
-- So the rule is: delete only what has no financial history. Anyone who has
-- taken money for the salon gets deactivated instead, which is what
-- deactivation is for. `tech_deletion_check` lets the UI say which one applies
-- before the manager commits to anything.
-- ============================================================================
create or replace function public.tech_deletion_check(p_tech_id uuid)
returns table (
  can_delete       boolean,
  completed_jobs   integer,
  payments_count   integer,
  future_bookings  integer,
  reason           text
)
language sql
stable
security definer
set search_path = public
as $$
  with counts as (
    select
      (select count(*)::int from public.jobs
        where tech_id = p_tech_id and status = 'completed') as jobs,
      (select count(*)::int from public.payments
        where tech_id = p_tech_id) as pays,
      (select count(*)::int from public.appointments
        where tech_id = p_tech_id and status = 'scheduled' and scheduled_at > now()) as future
  )
  select
    (c.jobs = 0 and c.pays = 0),
    c.jobs,
    c.pays,
    c.future,
    case
      when c.pays > 0 then
        'They have ' || c.pays || ' payment' || case when c.pays = 1 then '' else 's' end ||
        ' on record. Deleting would detach those from the books — deactivate instead.'
      when c.jobs > 0 then
        'They have completed ' || c.jobs || ' service' || case when c.jobs = 1 then '' else 's' end ||
        '. Deleting would remove them from that history — deactivate instead.'
      when c.future > 0 then
        'Deleting will leave ' || c.future || ' future booking' ||
        case when c.future = 1 then '' else 's' end || ' with nobody assigned.'
      else 'Nothing recorded against them yet — safe to remove entirely.'
    end
  from counts c
  where public.is_manager();
$$;

revoke all on function public.tech_deletion_check(uuid) from public;
grant execute on function public.tech_deletion_check(uuid) to authenticated;

create or replace function public.delete_tech(p_tech_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_name  text;
  v_check record;
begin
  if not public.is_manager() then
    raise exception 'Only a manager can remove someone from the team'
      using errcode = 'insufficient_privilege';
  end if;

  if p_tech_id = auth.uid() then
    raise exception 'You cannot remove your own account'
      using errcode = 'check_violation';
  end if;

  select full_name into v_name from public.profiles
  where id = p_tech_id and salon_id = public.current_salon_id();

  if v_name is null then
    raise exception 'They are not on this salon''s roster' using errcode = 'no_data_found';
  end if;

  select * into v_check from public.tech_deletion_check(p_tech_id);

  if not v_check.can_delete then
    raise exception '%', v_check.reason using errcode = 'check_violation';
  end if;

  -- Shifts, check-ins, the usual week and the extended profile all cascade.
  -- Future bookings fall back to unassigned, which the dashboard already
  -- flags — better than deleting a client's appointment out from under them.
  delete from public.profiles where id = p_tech_id;

  return v_name;
end;
$$;

revoke all on function public.delete_tech(uuid) from public;
grant execute on function public.delete_tech(uuid) to authenticated;
