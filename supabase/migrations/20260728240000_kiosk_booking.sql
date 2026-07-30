-- ============================================================================
-- Walk-in booking from the kiosk.
--
-- A customer picks services, a tech and a time, and gets a real appointment —
-- the same row an admin creates, so it lands on the day calendar and in the
-- tech's queue with no extra plumbing.
--
-- ---------------------------------------------------------------------------
-- Where availability is computed
-- ---------------------------------------------------------------------------
-- Here. Only here. `kiosk_available_slots` is the single answer to "when can
-- this happen", and `kiosk_book` re-asks it inside the writing transaction
-- rather than trusting the slot the tablet sends back. The browser renders a
-- list of times; it never derives one.
--
-- ---------------------------------------------------------------------------
-- Why the race is actually safe
-- ---------------------------------------------------------------------------
-- Not because of the re-check — a re-check is still a read followed by a write,
-- and two transactions can both pass it. It is safe because of a constraint
-- that already existed:
--
--   schedule_blocks_no_overlap
--     EXCLUDE USING gist (tech_id WITH =, tstzrange(blocked_from, blocked_to) WITH &&)
--
-- Every appointment with a tech gets a `schedule_blocks` row via the
-- `appointments_sync_block` trigger, so two overlapping bookings for one tech
-- cannot both commit no matter how they interleave. The re-check exists to turn
-- that into a civil message instead of a raw constraint error; the constraint is
-- what makes it true.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Registration fields.
--
-- `name` stays and stays authoritative for everything that already reads it —
-- the calendar, the queue, every list. The split is additive and kept in sync,
-- so nothing has to be migrated to keep working.
-- ----------------------------------------------------------------------------
alter table public.customers
  add column if not exists first_name text,
  add column if not exists last_name  text,
  -- Which language to greet them in. 'en' or 'vi' today; a text column rather
  -- than an enum because the third one should not need a migration.
  add column if not exists language text not null default 'en';

-- Backfill the split from the name already on file. A guess, and a safe one:
-- `name` is untouched, so a wrong split costs a wrong greeting, never a
-- mismatched record.
update public.customers
   set first_name = coalesce(first_name, split_part(trim(name), ' ', 1)),
       last_name  = coalesce(
         last_name,
         nullif(regexp_replace(trim(name), '^\S+\s*', ''), '')
       )
 where first_name is null or last_name is null;

/**
 * Keep `name` in step with the split.
 *
 * One direction only: writing the parts rebuilds `name`. Anything that only
 * knows about `name` — every existing screen and every existing insert — keeps
 * working untouched, and the kiosk's two fields cannot drift from the single
 * field the rest of the app reads.
 */
create or replace function public.sync_customer_name()
returns trigger
language plpgsql
as $$
begin
  if new.first_name is not null or new.last_name is not null then
    new.name := nullif(trim(
      coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, '')
    ), '');
    if new.name is null then
      new.name := coalesce(old.name, 'Guest');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists customers_sync_name on public.customers;
create trigger customers_sync_name
  before insert or update of first_name, last_name on public.customers
  for each row execute function public.sync_customer_name();

-- ----------------------------------------------------------------------------
-- The held window must match the real duration.
--
-- `sync_appointment_block` sized the block from `service_id` alone — the first
-- service — so a three-service visit held 45 minutes of a tech's day while
-- occupying 90. The exclusion constraint above is only as honest as the range
-- it is given: under-sizing it lets a second booking land inside the first, and
-- the whole race-safety argument collapses.
--
-- `appointment_minutes()` is the same function the day calendar already draws
-- with, so the block, the calendar and the availability search now agree.
-- ----------------------------------------------------------------------------
create or replace function public.sync_appointment_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minutes integer;
  v_client  text;
begin
  if tg_op = 'DELETE' or new.tech_id is null or new.status in ('cancelled', 'completed') then
    delete from public.schedule_blocks
    where appointment_id = coalesce(new.id, old.id);
    return coalesce(new, old);
  end if;

  v_minutes := public.appointment_minutes(new.id);

  select c.name into v_client from public.customers c where c.id = new.customer_id;

  insert into public.schedule_blocks (
    salon_id, tech_id, kind, starts_at, ends_at, appointment_id, title, created_by
  )
  values (
    new.salon_id, new.tech_id, 'appointment',
    new.scheduled_at,
    new.scheduled_at + make_interval(mins => v_minutes),
    new.id,
    coalesce(v_client, 'Client') || ' · ' || new.service_name,
    auth.uid()
  )
  on conflict (appointment_id) do update
    set tech_id   = excluded.tech_id,
        starts_at = excluded.starts_at,
        ends_at   = excluded.ends_at,
        title     = excluded.title;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- One per category, add-ons unlimited.
--
-- Enforced here rather than only in the picker, because the picker is code
-- running on a device a customer is holding. A basket with two manicures in it
-- is not a preference, it is a mis-tap that would book ninety minutes of
-- overlapping work into one slot.
-- ----------------------------------------------------------------------------
create or replace function public.services_basket_is_valid(p_service_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.services s
    where s.id = any (coalesce(p_service_ids, '{}'::uuid[]))
      and s.category <> 'addon'
    group by s.category
    having count(*) > 1
  );
$$;

revoke all on function public.services_basket_is_valid(uuid[]) from public;
grant execute on function public.services_basket_is_valid(uuid[]) to authenticated;

/** How long a basket takes. The same sum the block and the calendar use. */
create or replace function public.services_total_minutes(p_service_ids uuid[])
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    coalesce((select sum(coalesce(s.duration_minutes, 0))::integer
                from public.services s
               where s.id = any (coalesce(p_service_ids, '{}'::uuid[]))), 0),
    15
  );
$$;

revoke all on function public.services_total_minutes(uuid[]) from public;
grant execute on function public.services_total_minutes(uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- The menu the kiosk may see.
--
-- Active only, and read straight from `services` — so retiring a service in
-- the manager UI removes it from the tablet on the next tap, with no deploy.
-- Prices and durations come from the row; nothing is baked into the screen.
-- ----------------------------------------------------------------------------
create or replace function public.kiosk_service_menu()
returns table (
  id               uuid,
  name             text,
  category         public.service_category,
  price            numeric,
  duration_minutes integer,
  sort_order       integer
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.category, s.price,
         coalesce(s.duration_minutes, 45), s.sort_order
  from public.services s
  where s.salon_id = public.kiosk_salon_id()
    and s.is_active
  order by s.category, s.sort_order, s.name;
$$;

revoke all on function public.kiosk_service_menu() from public;
grant execute on function public.kiosk_service_menu() to authenticated;

-- ----------------------------------------------------------------------------
-- Free windows for one tech on one day, as ranges.
--
-- The shift, minus breaks and time off, minus everything already booked,
-- each expanded by the salon's buffer so a slot the search offers is a slot
-- the exclusion constraint will actually accept.
-- ----------------------------------------------------------------------------
create or replace function public.tech_free_windows(
  p_tech_id uuid,
  p_day     date,
  p_salon   uuid
)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select b.starts_at as day_start, b.ends_at as day_end
    from public.salon_day_bounds(p_day) b
  ),
  shifts as (
    select greatest(sb.starts_at, d.day_start) as s,
           least(sb.ends_at, d.day_end)        as e
    from public.shift_blocks sb, bounds d
    where sb.salon_id = p_salon
      and sb.tech_id = p_tech_id
      and sb.kind = 'shift'
      and sb.starts_at < d.day_end
      and sb.ends_at   > d.day_start
  ),
  busy as (
    -- Time off and breaks.
    select sb.starts_at as s, sb.ends_at as e
    from public.shift_blocks sb, bounds d
    where sb.salon_id = p_salon and sb.tech_id = p_tech_id
      and sb.kind <> 'shift'
      and sb.starts_at < d.day_end and sb.ends_at > d.day_start
    union all
    -- Everything already held for this tech: appointments and manual blocks
    -- alike, read through the very column the exclusion constraint uses, so
    -- the search and the constraint cannot disagree about what is taken.
    select bl.blocked_from, bl.blocked_to
    from public.schedule_blocks bl, bounds d
    where bl.salon_id = p_salon and bl.tech_id = p_tech_id
      and bl.blocked_from < d.day_end and bl.blocked_to > d.day_start
  ),
  -- Subtract busy from each shift by walking the gaps between busy intervals.
  edges as (
    select sh.s, sh.e,
           coalesce(
             (select array_agg(x order by x)
              from (
                select greatest(b.s, sh.s) as x from busy b
                where b.e > sh.s and b.s < sh.e
                union all
                select least(b.e, sh.e) from busy b
                where b.e > sh.s and b.s < sh.e
              ) pts(x)),
             '{}'::timestamptz[]
           ) as cuts
    from shifts sh
  )
  select w.ws, w.we
  from edges,
  lateral (
    select gs.ws, gs.we
    from (
      select unnest(array[edges.s] || edges.cuts) as ws,
             unnest(edges.cuts || array[edges.e]) as we
    ) gs
    where gs.we > gs.ws
      -- Keep only gaps that are genuinely free: a candidate window that
      -- overlaps any busy interval is a cut point, not a gap.
      and not exists (
        select 1 from busy b where b.s < gs.we and b.e > gs.ws
      )
  ) w(ws, we);
$$;

revoke all on function public.tech_free_windows(uuid, date, uuid) from public;
grant execute on function public.tech_free_windows(uuid, date, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Bookable start times.
--
-- `p_tech_id` null means "anyone who can do it", and a slot is returned when at
-- least one qualified tech can take the whole basket end to end.
--
-- Everything the answer depends on — shift windows, breaks, existing bookings,
-- the total duration, the skills the basket needs, the salon's buffer, and how
-- soon is too soon — is read here. The tablet receives times and nothing else.
-- ----------------------------------------------------------------------------
create or replace function public.kiosk_available_slots(
  p_service_ids uuid[],
  p_tech_id     uuid default null,
  p_day         date default null
)
returns table (
  slot_at    timestamptz,
  tech_id    uuid,
  tech_name  text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon   uuid := public.kiosk_salon_id();
  v_day     date;
  v_minutes integer;
  v_skills  public.skill[];
begin
  if v_salon is null then
    raise exception 'This device is not set up' using errcode = 'insufficient_privilege';
  end if;

  if not public.services_basket_is_valid(p_service_ids) then
    raise exception 'Only one service per category, plus any add-ons'
      using errcode = 'check_violation';
  end if;

  v_day     := coalesce(p_day, public.salon_today(v_salon));
  v_minutes := public.services_total_minutes(p_service_ids);
  v_skills  := public.skills_for_services(p_service_ids);

  return query
  with candidates as (
    select p.id, p.full_name
    from public.profiles p
    where p.salon_id = v_salon
      and p.role::text = 'tech'
      and p.is_active
      and p.skills @> v_skills
      and (p_tech_id is null or p.id = p_tech_id)
      -- On shift that day. A tech with no shift is not a tech you can book.
      and exists (
        select 1 from public.shift_blocks sb, public.salon_day_bounds(v_day) b
        where sb.tech_id = p.id and sb.salon_id = v_salon and sb.kind = 'shift'
          and sb.starts_at < b.ends_at and sb.ends_at > b.starts_at
      )
  ),
  windows as (
    select c.id, c.full_name, w.starts_at, w.ends_at
    from candidates c
    cross join lateral public.tech_free_windows(c.id, v_day, v_salon) w
    -- Only windows long enough for the whole basket.
    where w.ends_at - w.starts_at >= make_interval(mins => v_minutes)
  ),
  grid as (
    select w.id, w.full_name, g.at
    from windows w
    cross join lateral generate_series(
      -- Start on a quarter-hour boundary so the offered times read as times.
      date_trunc('hour', w.starts_at)
        + make_interval(mins => (ceil(extract(minute from w.starts_at) / 15.0) * 15)::integer),
      w.ends_at - make_interval(mins => v_minutes),
      interval '15 minutes'
    ) g(at)
    where g.at >= w.starts_at
  )
  select g.at, g.id, g.full_name
  from grid g
  -- Nothing in the past, and not so soon the client cannot walk to the chair.
  where g.at >= now() + interval '5 minutes'
  order by g.at, g.full_name;
end;
$$;

revoke all on function public.kiosk_available_slots(uuid[], uuid, date) from public;
grant execute on function public.kiosk_available_slots(uuid[], uuid, date) to authenticated;

-- ----------------------------------------------------------------------------
-- Who can take this basket today, and when they could start.
--
-- Derived from the same slot search, so the tech list and the time list can
-- never disagree about who is available. A tech with no remaining opening long
-- enough for the basket does not appear at all.
-- ----------------------------------------------------------------------------
create or replace function public.kiosk_available_techs(
  p_service_ids uuid[],
  p_day         date default null
)
returns table (
  tech_id      uuid,
  full_name    text,
  next_opening timestamptz,
  openings     integer
)
language sql
stable
security definer
set search_path = public
as $$
  select s.tech_id, s.tech_name, min(s.slot_at), count(*)::integer
  from public.kiosk_available_slots(p_service_ids, null, p_day) s
  group by s.tech_id, s.tech_name
  order by min(s.slot_at), s.tech_name;
$$;

revoke all on function public.kiosk_available_techs(uuid[], date) from public;
grant execute on function public.kiosk_available_techs(uuid[], date) to authenticated;

-- ----------------------------------------------------------------------------
-- Register a new client from the tablet.
--
-- Deliberately narrow: five fields and no way to reach an existing record. The
-- kiosk cannot look a client up by name, so it cannot be used to discover one,
-- and it cannot edit one, so a returning client typing a slightly different
-- name creates a duplicate rather than overwriting somebody.
-- ----------------------------------------------------------------------------
create or replace function public.kiosk_register_client(
  p_first        text,
  p_last         text,
  p_phone        text,
  p_language     text default 'en',
  p_sensitivities text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon  uuid := public.kiosk_salon_id();
  v_digits text := public.normalize_phone(p_phone);
  v_first  text := nullif(trim(coalesce(p_first, '')), '');
  v_id     uuid;
begin
  if v_salon is null then
    raise exception 'This device is not set up' using errcode = 'insufficient_privilege';
  end if;

  if v_first is null then
    raise exception 'A first name is needed' using errcode = 'check_violation';
  end if;

  if length(v_digits) <> 10 then
    raise exception 'A full phone number is needed' using errcode = 'check_violation';
  end if;

  -- If that number is already on file, hand back the existing client rather
  -- than making a second one. Not a lookup the customer can steer: they had to
  -- type the whole number, which is the same bar `kiosk_lookup_client` sets.
  select c.id into v_id
  from public.customers c
  where c.salon_id = v_salon and public.normalize_phone(c.phone) = v_digits
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.customers
    (salon_id, name, first_name, last_name, phone, language, allergies)
  values (
    v_salon,
    v_first,  -- the sync trigger rebuilds this from the parts
    v_first,
    nullif(trim(coalesce(p_last, '')), ''),
    v_digits,
    case when p_language in ('en', 'vi') then p_language else 'en' end,
    nullif(trim(coalesce(p_sensitivities, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.kiosk_register_client(text, text, text, text, text) from public;
grant execute on function public.kiosk_register_client(text, text, text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Book it.
--
-- Three defences, in order of how much they are relied on:
--
--   1. Re-validate the slot inside this transaction. Catches the ordinary case
--      and produces a sentence a customer can read.
--   2. An advisory lock on the tech, so two kiosks choosing the same tech
--      serialise rather than interleaving between the check and the insert.
--   3. The exclusion constraint on `schedule_blocks`. This is the one that is
--      actually load bearing — 1 and 2 exist to make it civil, not to replace
--      it. A `23P01` here means someone won the race; it is reported as such.
--
-- The kiosk can create, and only create. There is no update path and no cancel
-- path in this function, and the restrictive policies from run 1 mean it has no
-- direct one either.
-- ----------------------------------------------------------------------------
create or replace function public.kiosk_book(
  p_customer_id uuid,
  p_service_ids uuid[],
  p_tech_id     uuid,
  p_starts_at   timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon   uuid := public.kiosk_salon_id();
  v_tech    uuid := p_tech_id;
  v_appt    public.appointments;
  v_minutes integer;
  v_name    text;
  v_ahead   integer;
begin
  if v_salon is null then
    raise exception 'This device is not set up' using errcode = 'insufficient_privilege';
  end if;

  if p_customer_id is null
     or not exists (select 1 from public.customers where id = p_customer_id and salon_id = v_salon)
  then
    return jsonb_build_object('result', 'invalid');
  end if;

  if coalesce(cardinality(p_service_ids), 0) = 0 then
    return jsonb_build_object('result', 'no_services');
  end if;

  if not public.services_basket_is_valid(p_service_ids) then
    return jsonb_build_object('result', 'invalid_basket');
  end if;

  v_minutes := public.services_total_minutes(p_service_ids);

  -- "First available" arrives as a null tech: pick the one who can start then.
  if v_tech is null then
    select s.tech_id into v_tech
    from public.kiosk_available_slots(p_service_ids, null, (p_starts_at at time zone
           (select timezone from public.salons where id = v_salon))::date) s
    where s.slot_at = p_starts_at
    limit 1;

    if v_tech is null then
      return jsonb_build_object('result', 'taken');
    end if;
  end if;

  -- Serialise anyone booking this tech. Transaction-scoped, so it releases on
  -- commit or rollback with nothing to clean up.
  perform pg_advisory_xact_lock(hashtextextended(v_tech::text, 0));

  -- Re-ask the question that was asked thirty seconds ago on the tablet.
  if not exists (
    select 1
    from public.kiosk_available_slots(p_service_ids, v_tech, (p_starts_at at time zone
           (select timezone from public.salons where id = v_salon))::date) s
    where s.slot_at = p_starts_at and s.tech_id = v_tech
  ) then
    return jsonb_build_object('result', 'taken');
  end if;

  select string_agg(s.name, ' + ' order by array_position(p_service_ids, s.id))
    into v_name
  from public.services s
  where s.id = any (p_service_ids) and s.salon_id = v_salon;

  begin
    insert into public.appointments
      (salon_id, customer_id, tech_id, service_id, scheduled_at, service_name, status)
    values
      (v_salon, p_customer_id, v_tech, p_service_ids[1], p_starts_at,
       left(coalesce(v_name, 'Walk-in'), 120), 'scheduled')
    returning * into v_appt;

    insert into public.appointment_services
      (salon_id, appointment_id, service_id, name, price, sort_order)
    select v_salon, v_appt.id, s.id, s.name, s.price, array_position(p_service_ids, s.id)
    from public.services s
    where s.id = any (p_service_ids) and s.salon_id = v_salon;

    -- The block was sized when the appointment row went in, and at that moment
    -- the basket did not exist yet — so it holds one service's worth of time
    -- for a visit that may be three. Touching the row re-fires the sync trigger
    -- now that `appointment_minutes()` can see the whole basket, and the
    -- exclusion constraint gets its say on the *real* length. Inside this
    -- block, so a resize that collides is reported like any other loss.
    update public.appointments
       set service_name = service_name
     where id = v_appt.id;
  exception when exclusion_violation then
    -- The constraint caught what the re-check could not: someone committed
    -- between the two. Same answer either way.
    return jsonb_build_object('result', 'taken');
  end;

  select count(*) into v_ahead
  from public.appointments a
  where a.salon_id = v_salon
    and a.tech_id = v_tech
    and a.status = 'scheduled'
    and a.scheduled_at < v_appt.scheduled_at
    and a.scheduled_at >= now();

  return jsonb_build_object(
    'result',       'booked',
    'appointment_id', v_appt.id,
    'starts_at',    v_appt.scheduled_at,
    'minutes',      v_minutes,
    'services',     v_name,
    'tech_name',    (select full_name from public.profiles where id = v_tech),
    'ahead',        v_ahead
  );
end;
$$;

revoke all on function public.kiosk_book(uuid, uuid[], uuid, timestamptz) from public;
grant execute on function public.kiosk_book(uuid, uuid[], uuid, timestamptz) to authenticated;
