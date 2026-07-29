-- ============================================================================
-- More than one service per visit.
--
-- A client who books a gel manicure, a pedicure and nail art is one client and
-- one turn, not three. The checkout already understood that — `job_services`
-- has been a line-item table since the start — but nothing upstream did:
--
--   * a booking could hold exactly one `service_id`, so the other two lived
--     only in the free-text `service_name` and vanished at checkout;
--   * `check_in_appointment` never copied `service_id` onto the job at all,
--     and called `suggest_next_tech` with no skills — so an appointment for a
--     full set of acrylics could be handed to someone who has never done one.
--     The walk-in path passed skills; the booked path silently did not.
--
-- Nothing here is destructive: `appointments.service_id` stays and keeps
-- meaning "the main service", and `service_name` keeps its combined text so
-- every existing screen reads the same as it did.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- What was booked, one row per service. Mirrors `job_services` so the two
-- copy across at check-in without translation.
-- ----------------------------------------------------------------------------
create table if not exists public.appointment_services (
  id             uuid primary key default gen_random_uuid(),
  salon_id       uuid not null references public.salons(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  -- Null when the desk typed something off-menu. The name and price are
  -- snapshotted either way, so deleting a service never rewrites a booking.
  service_id     uuid references public.services(id) on delete set null,
  name           text not null,
  price          numeric(10,2) not null default 0,
  quantity       integer not null default 1 check (quantity > 0),
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists appointment_services_appointment_idx
  on public.appointment_services (appointment_id, sort_order);

alter table public.appointment_services enable row level security;

create policy "salon can view booked services"
  on public.appointment_services for select
  to authenticated
  using (salon_id = public.current_salon_id());

create policy "front desk can add booked services"
  on public.appointment_services for insert
  to authenticated
  with check (salon_id = public.current_salon_id() and public.can_manage_floor());

create policy "front desk can update booked services"
  on public.appointment_services for update
  to authenticated
  using (salon_id = public.current_salon_id() and public.can_manage_floor())
  with check (salon_id = public.current_salon_id() and public.can_manage_floor());

create policy "front desk can remove booked services"
  on public.appointment_services for delete
  to authenticated
  using (salon_id = public.current_salon_id() and public.can_manage_floor());

grant select, insert, update, delete on public.appointment_services to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.appointment_services;
exception when duplicate_object then null;
end $$;

-- Backfill: every existing booking with a service becomes a one-line basket,
-- so the new read path never has to fall back to the old column.
insert into public.appointment_services (salon_id, appointment_id, service_id, name, price, sort_order)
select a.salon_id, a.id, a.service_id, coalesce(a.service_name, s.name), coalesce(s.price, 0), 0
from public.appointments a
join public.services s on s.id = a.service_id
where a.service_id is not null
  and not exists (
    select 1 from public.appointment_services x where x.appointment_id = a.id
  );

-- ----------------------------------------------------------------------------
-- The skills a whole basket needs.
--
-- One tech does the whole visit, so the requirement is the union: three
-- services means whoever takes it must be able to do all three. Resolved
-- through `effective_service_skills`, so category inheritance applies exactly
-- once and in one place.
-- ----------------------------------------------------------------------------
create or replace function public.skills_for_services(p_service_ids uuid[])
returns public.skill[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select array_agg(distinct sk order by sk)
     from public.services s
     cross join lateral unnest(
       public.effective_service_skills(s.category, s.required_skills)
     ) as u(sk)
     where s.id = any (coalesce(p_service_ids, '{}'::uuid[]))
       and s.salon_id = public.current_salon_id()),
    '{}'::public.skill[]
  );
$$;

revoke all on function public.skills_for_services(uuid[]) from public;
grant execute on function public.skills_for_services(uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- Book a visit of one or more services, in one call.
--
-- Doing this in SQL rather than three round trips from the app matters for one
-- reason: a booking that half-saved — appointment row written, basket not —
-- would show the right name and charge the wrong money.
-- ----------------------------------------------------------------------------
create or replace function public.book_appointment(
  p_customer_id  uuid,
  p_scheduled_at timestamptz,
  p_service_ids  uuid[],
  p_service_name text,
  p_tech_id      uuid default null,
  p_notes        text default null
)
returns public.appointments
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_appt   public.appointments;
  v_salon  uuid := public.current_salon_id();
  v_ids    uuid[] := coalesce(p_service_ids, '{}'::uuid[]);
  v_name   text;
  v_skills public.skill[];
begin
  if not public.can_manage_floor() then
    raise exception 'Only the front desk can book appointments'
      using errcode = 'insufficient_privilege';
  end if;

  if p_customer_id is null then
    raise exception 'A booking needs a client' using errcode = 'check_violation';
  end if;

  -- The display name is whatever the desk typed, or the basket joined up.
  v_name := nullif(trim(coalesce(p_service_name, '')), '');
  if v_name is null then
    select string_agg(s.name, ' + ' order by array_position(v_ids, s.id))
      into v_name
    from public.services s
    where s.id = any (v_ids) and s.salon_id = v_salon;
  end if;

  if v_name is null then
    raise exception 'Pick or type a service' using errcode = 'check_violation';
  end if;

  -- `service_name` is capped at 120 characters, and four joined-up service
  -- names clear that easily. The basket is the real record; this column is the
  -- one-line label, so trimming it loses nothing.
  v_name := left(v_name, 120);

  v_skills := public.skills_for_services(v_ids);

  -- A requested tech who cannot do the work is a booking that fails at
  -- check-in instead of at the desk, in front of the client.
  if p_tech_id is not null and cardinality(v_skills) > 0 then
    if not exists (
      select 1 from public.profiles p
      where p.id = p_tech_id and p.salon_id = v_salon and p.skills @> v_skills
    ) then
      raise exception 'That tech does not offer everything in this booking'
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.appointments
    (salon_id, customer_id, tech_id, service_id, scheduled_at, service_name, notes, status)
  values
    (v_salon, p_customer_id, p_tech_id, v_ids[1], p_scheduled_at, v_name,
     nullif(trim(coalesce(p_notes, '')), ''), 'scheduled')
  returning * into v_appt;

  insert into public.appointment_services
    (salon_id, appointment_id, service_id, name, price, sort_order)
  select v_salon, v_appt.id, s.id, s.name, s.price,
         array_position(v_ids, s.id)
  from public.services s
  where s.id = any (v_ids) and s.salon_id = v_salon;

  return v_appt;
end;
$$;

revoke all on function public.book_appointment(uuid, timestamptz, uuid[], text, uuid, text) from public;
grant execute on function public.book_appointment(uuid, timestamptz, uuid[], text, uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Check-in, carrying the whole basket through.
--
-- Three fixes over the original, all of them the same bug wearing different
-- hats — the booked path knew less than the walk-in path:
--
--   1. the job now gets `service_id`, so the ticket knows what was booked;
--   2. it gets the union of the basket's effective skills, so the rotation
--      cannot hand an acrylic full set to someone who only does dip;
--   3. `suggest_next_tech` is given those skills, so the *suggestion* obeys
--      the same rule the assignment does.
-- ----------------------------------------------------------------------------
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
  v_skills public.skill[];
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

  -- Prefer the basket; fall back to the single column for bookings made
  -- before this migration that somehow escaped the backfill.
  select coalesce(
           public.skills_for_services(array_agg(a.service_id) filter (where a.service_id is not null)),
           '{}'::public.skill[]
         )
    into v_skills
  from public.appointment_services a
  where a.appointment_id = v_appt.id;

  if coalesce(cardinality(v_skills), 0) = 0 and v_appt.service_id is not null then
    v_skills := public.skills_for_services(array[v_appt.service_id]);
  end if;

  insert into public.jobs (
    salon_id, customer_id, tech_id, appointment_id, service_id, required_skills,
    type, status, service_name, notes
  )
  values (
    v_appt.salon_id,
    v_appt.customer_id,
    -- Booked tech keeps their client; otherwise the rotation picks one who
    -- can actually do the work.
    coalesce(v_appt.tech_id, public.suggest_next_tech(v_appt.salon_id, v_skills)),
    v_appt.id,
    v_appt.service_id,
    v_skills,
    'appointment',
    'waiting',
    v_appt.service_name,
    v_appt.notes
  )
  returning * into v_job;

  -- Carry the basket onto the ticket so checkout isn't re-picking what the
  -- client already chose when they booked.
  insert into public.job_services (salon_id, job_id, service_id, name, price, quantity)
  select v_appt.salon_id, v_job.id, a.service_id, a.name, a.price, a.quantity
  from public.appointment_services a
  where a.appointment_id = v_appt.id
  order by a.sort_order;

  if not found and v_appt.service_id is not null then
    insert into public.job_services (salon_id, job_id, service_id, name, price)
    select v_appt.salon_id, v_job.id, s.id, s.name, s.price
    from public.services s
    where s.id = v_appt.service_id;
  end if;

  update public.appointments set status = 'checked_in' where id = p_appointment_id;

  return v_job;
end;
$$;

revoke all on function public.check_in_appointment(uuid) from public;
grant execute on function public.check_in_appointment(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Read a booking's basket back, for the edit sheet.
-- ----------------------------------------------------------------------------
create or replace function public.appointment_basket(p_appointment_id uuid)
returns table (
  service_id uuid,
  name       text,
  price      numeric,
  quantity   integer
)
language sql
stable
security definer
set search_path = public
as $$
  select a.service_id, a.name, a.price, a.quantity
  from public.appointment_services a
  where a.appointment_id = p_appointment_id
    and a.salon_id = public.current_salon_id()
  order by a.sort_order, a.name;
$$;

revoke all on function public.appointment_basket(uuid) from public;
grant execute on function public.appointment_basket(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Replace a booking's basket wholesale.
--
-- Called by the edit sheet. Wholesale rather than per-line because the sheet
-- edits a set: working out which lines were added and which removed on the
-- client, then sending three calls, is how a basket ends up with duplicates.
-- ----------------------------------------------------------------------------
create or replace function public.set_appointment_services(
  p_appointment_id uuid,
  p_service_ids    uuid[]
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon uuid := public.current_salon_id();
  v_ids   uuid[] := coalesce(p_service_ids, '{}'::uuid[]);
  v_name  text;
begin
  if not public.can_manage_floor() then
    raise exception 'Only the front desk can change a booking'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.appointments a
    where a.id = p_appointment_id and a.salon_id = v_salon
  ) then
    raise exception 'That booking no longer exists' using errcode = 'no_data_found';
  end if;

  delete from public.appointment_services
   where appointment_id = p_appointment_id and salon_id = v_salon;

  insert into public.appointment_services
    (salon_id, appointment_id, service_id, name, price, sort_order)
  select v_salon, p_appointment_id, s.id, s.name, s.price, array_position(v_ids, s.id)
  from public.services s
  where s.id = any (v_ids) and s.salon_id = v_salon;

  select string_agg(s.name, ' + ' order by array_position(v_ids, s.id))
    into v_name
  from public.services s
  where s.id = any (v_ids) and s.salon_id = v_salon;

  -- Keep the single-column view of the booking honest: every screen that has
  -- not been taught about baskets still reads these two.
  update public.appointments
     set service_id   = v_ids[1],
         service_name = coalesce(left(v_name, 120), service_name)
   where id = p_appointment_id and salon_id = v_salon;
end;
$$;

revoke all on function public.set_appointment_services(uuid, uuid[]) from public;
grant execute on function public.set_appointment_services(uuid, uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- Check a walk-in in with a whole basket.
--
-- The app used to do this in three writes — customer, job, one line item — and
-- only ever seeded one line. Same reasoning as `book_appointment`: a job whose
-- ticket half-saved charges the wrong money, and the skills a walk-in needs
-- have to be the union of everything they asked for or the rotation will hand
-- them to someone who can only do the first item.
-- ----------------------------------------------------------------------------
create or replace function public.check_in_walkin(
  p_customer_id  uuid,
  p_service_ids  uuid[],
  p_service_name text,
  p_type         public.job_type default 'walk-in',
  p_tech_id      uuid default null,
  /** True when the desk chose "leave open" rather than naming a tech. */
  p_leave_open   boolean default false,
  p_notes        text default null,
  p_photo_url    text default null
)
returns public.jobs
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_job    public.jobs;
  v_salon  uuid := public.current_salon_id();
  v_ids    uuid[] := coalesce(p_service_ids, '{}'::uuid[]);
  v_name   text;
  v_skills public.skill[];
  v_tech   uuid;
begin
  if not public.can_manage_floor() then
    raise exception 'Only the front desk can check clients in'
      using errcode = 'insufficient_privilege';
  end if;

  if p_customer_id is null then
    raise exception 'A check-in needs a client' using errcode = 'check_violation';
  end if;

  v_name := nullif(trim(coalesce(p_service_name, '')), '');
  if v_name is null then
    select string_agg(s.name, ' + ' order by array_position(v_ids, s.id))
      into v_name
    from public.services s
    where s.id = any (v_ids) and s.salon_id = v_salon;
  end if;

  if v_name is null then
    raise exception 'Pick or type a service' using errcode = 'check_violation';
  end if;

  v_name   := left(v_name, 120);
  v_skills := public.skills_for_services(v_ids);

  if p_leave_open then
    v_tech := null;
  elsif p_tech_id is not null then
    v_tech := p_tech_id;
  else
    -- The fair path is the default path: the rotation picks, filtered by what
    -- the whole basket needs.
    v_tech := public.suggest_next_tech(v_salon, v_skills);
  end if;

  insert into public.jobs (
    salon_id, customer_id, tech_id, service_id, required_skills,
    type, status, service_name, notes, photo_url
  )
  values (
    v_salon, p_customer_id, v_tech, v_ids[1], v_skills,
    coalesce(p_type, 'walk-in'), 'waiting', v_name,
    nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_photo_url, '')), '')
  )
  returning * into v_job;

  insert into public.job_services (salon_id, job_id, service_id, name, price)
  select v_salon, v_job.id, s.id, s.name, s.price
  from public.services s
  where s.id = any (v_ids) and s.salon_id = v_salon;

  return v_job;
end;
$$;

revoke all on function public.check_in_walkin(uuid, uuid[], text, public.job_type, uuid, boolean, text, text) from public;
grant execute on function public.check_in_walkin(uuid, uuid[], text, public.job_type, uuid, boolean, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Editing a booking has to check the tech against the whole basket.
--
-- The previous version checked the requested tech against
-- `v_service.required_skills` — the skills column of the one service passed in.
-- Two things broke that:
--
--   1. that column now holds only the *extras*, so a plain manicure looked
--      like it needed nothing and anyone could be assigned to it;
--   2. a booking can hold several services, and the edit sheet no longer sends
--      a single `p_service_id` at all — it rewrites the basket first — so the
--      check had nothing to check against and silently passed.
--
-- Now the requirement is read from the booking itself, after the basket has
-- been saved: the union of what is actually booked. `p_service_id` still works
-- for any caller that passes one, and still wins over the basket for the
-- single-service columns.
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
  v_skills  public.skill[];
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

  -- What this booking will need once this call is done: the service being set
  -- if one was passed, otherwise everything currently in the basket.
  if p_service_id is not null then
    v_skills := public.skills_for_services(array[p_service_id]);
  else
    select coalesce(
             public.skills_for_services(
               array_agg(a.service_id) filter (where a.service_id is not null)
             ),
             '{}'::public.skill[]
           )
      into v_skills
    from public.appointment_services a
    where a.appointment_id = p_id;
  end if;

  -- A tech has to be on the roster, and has to do the work.
  if p_tech_id is not null then
    if not exists (
      select 1 from public.profiles
      where id = p_tech_id and salon_id = public.current_salon_id() and is_active
    ) then
      raise exception 'That tech is not on this salon''s roster' using errcode = 'no_data_found';
    end if;

    if coalesce(cardinality(v_skills), 0) > 0 then
      if not (
        select coalesce(skills, '{}') @> v_skills
        from public.profiles where id = p_tech_id
      ) then
        raise exception 'That tech does not offer everything in this booking'
          using errcode = 'check_violation';
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
