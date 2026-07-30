-- ============================================================================
-- The kiosk: a device that can check a client in and learn nothing else.
--
-- ---------------------------------------------------------------------------
-- How the privilege boundary actually works here
-- ---------------------------------------------------------------------------
-- `REVOKE` is the instinct, and it is the wrong instrument in this stack.
-- Supabase gives every signed-in user the *same* Postgres role — `authenticated`
-- — and distinguishes them only by `auth.uid()`. There is no `kiosk` database
-- role to revoke from; revoking from `authenticated` would lock out the whole
-- salon.
--
-- The instrument that does what REVOKE is meant to do is a RESTRICTIVE policy.
-- Permissive policies are OR-ed together, so adding one can only ever grant.
-- Restrictive policies are AND-ed with the result, so a failing one cannot be
-- satisfied by any other policy, present or future. That is a real deny, and
-- it composes: a policy added next year granting some new access still cannot
-- let a kiosk through this.
--
-- It also means nothing existing is edited. Every current policy on every
-- table below is left exactly as it was.
--
-- Verified in `scripts/kiosk-test.sql` by signing in as a kiosk and running raw
-- selects — they return zero rows, and the RPCs still work.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Devices.
--
-- One row per tablet, keyed to its auth user. `is_active` is the revocation
-- switch: unticking it kills the device's access on its next request without
-- anybody having to find the tablet.
-- ----------------------------------------------------------------------------
create table if not exists public.kiosk_devices (
  id           uuid primary key references auth.users(id) on delete cascade,
  salon_id     uuid not null references public.salons(id) on delete cascade,
  label        text not null check (char_length(trim(label)) between 1 and 60),
  is_active    boolean not null default true,
  last_seen_at timestamptz,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists kiosk_devices_salon_idx on public.kiosk_devices (salon_id);

-- How long before an appointment a client may check themselves in, and how
-- long after the slot they still can. Config, not a constant in the UI.
alter table public.salons
  add column if not exists checkin_early_minutes integer not null default 30,
  add column if not exists checkin_late_minutes  integer not null default 20,
  -- Hashed. The kiosk's hidden exit asks for this; it never leaves the server.
  add column if not exists kiosk_exit_pin_hash text;

-- ----------------------------------------------------------------------------
-- Is the caller a kiosk?
--
-- Deliberately *not* "is the caller not a manager": a check that names the
-- thing it denies keeps working when another role is added later.
-- ----------------------------------------------------------------------------
create or replace function public.is_kiosk()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role::text = 'kiosk'
  );
$$;

revoke all on function public.is_kiosk() from public;
grant execute on function public.is_kiosk() to authenticated;

/**
 * The kiosk's salon, and only if the device is still switched on.
 *
 * Separate from `current_salon_id()` because it additionally requires the
 * device row to be active — a revoked tablet resolves to NULL and every RPC
 * below then finds nothing.
 */
create or replace function public.kiosk_salon_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select d.salon_id
  from public.kiosk_devices d
  join public.profiles p on p.id = d.id
  where d.id = auth.uid() and d.is_active and p.role::text = 'kiosk';
$$;

revoke all on function public.kiosk_salon_id() from public;
grant execute on function public.kiosk_salon_id() to authenticated;

-- ----------------------------------------------------------------------------
-- The deny.
--
-- One restrictive policy per table holding client data, staff data, money or
-- schedule. A kiosk reads none of it directly; everything it is allowed to see
-- comes back through a SECURITY DEFINER function below, already masked.
--
-- `for all` covers select, insert, update and delete in one policy — a kiosk
-- must not write to these tables either.
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'customers', 'appointments', 'appointment_services',
    'jobs', 'job_services', 'payments', 'tech_pay',
    'profiles', 'salons', 'services',
    'shift_blocks', 'schedule_blocks', 'availability_patterns',
    'turn_checkins', 'notifications', 'tech_profiles'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format(
      'drop policy if exists "kiosk devices read nothing directly" on public.%I', t
    );
    execute format($f$
      create policy "kiosk devices read nothing directly"
        on public.%I
        as restrictive
        for all
        to authenticated
        using (not public.is_kiosk())
        with check (not public.is_kiosk())
    $f$, t);
  end loop;
end $$;

-- The device table itself: a kiosk may read its own row and nothing else, so
-- the screen can show which device it is. Managers see their salon's devices.
alter table public.kiosk_devices enable row level security;

create policy "a kiosk sees only itself"
  on public.kiosk_devices for select
  to authenticated
  using (id = auth.uid());

create policy "managers manage their salon's kiosks"
  on public.kiosk_devices for all
  to authenticated
  using (salon_id = public.current_salon_id() and public.is_manager())
  with check (salon_id = public.current_salon_id() and public.is_manager());

grant select, insert, update, delete on public.kiosk_devices to authenticated;

-- ----------------------------------------------------------------------------
-- Rate limiting, inside the database.
--
-- A phone number is a small search space. Without a limit, a device left alone
-- for ten minutes can enumerate a salon's entire client list one number at a
-- time — and the kiosk is, by design, the least supervised screen in the
-- building. The counter lives here rather than in the app because the app is
-- the thing an attacker with the tablet controls.
-- ----------------------------------------------------------------------------
create table if not exists public.kiosk_lookups (
  id         bigserial primary key,
  kiosk_id   uuid not null references auth.users(id) on delete cascade,
  looked_at  timestamptz not null default now(),
  -- Whether it matched. Kept for the "three misses -> walk-in" rule and so a
  -- manager can see a device being probed. The number itself is NOT stored.
  matched    boolean not null
);

create index if not exists kiosk_lookups_recent_idx
  on public.kiosk_lookups (kiosk_id, looked_at desc);

alter table public.kiosk_lookups enable row level security;

create policy "managers can review lookup activity"
  on public.kiosk_lookups for select
  to authenticated
  using (
    public.is_manager()
    and exists (
      select 1 from public.kiosk_devices d
      where d.id = kiosk_id and d.salon_id = public.current_salon_id()
    )
  );

grant select on public.kiosk_lookups to authenticated;

-- ----------------------------------------------------------------------------
-- Masking.
--
-- The screen faces a waiting room. It has to say enough that the right person
-- recognises themselves and the wrong person cannot learn anything: a first
-- name and an initial, and the last two digits of a number they already typed
-- in full.
-- ----------------------------------------------------------------------------
create or replace function public.mask_client_name(p_name text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(trim(p_name), '') = '' then 'Guest'
    when array_length(string_to_array(trim(p_name), ' '), 1) = 1 then trim(p_name)
    else (string_to_array(trim(p_name), ' '))[1] || ' ' ||
         upper(left((string_to_array(trim(p_name), ' '))[
           array_length(string_to_array(trim(p_name), ' '), 1)], 1)) || '.'
  end;
$$;

create or replace function public.mask_phone(p_phone text)
returns text
language sql
immutable
as $$
  select case
    when length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 4 then '•••'
    else '(•••) •••-' || right(regexp_replace(p_phone, '\D', '', 'g'), 2) || '••'
  end;
$$;

/** Digits only — the one canonical form a phone is compared in. */
create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
as $$
  select right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
$$;

-- ----------------------------------------------------------------------------
-- What the idle screen needs. No client data, so no rate limit.
-- ----------------------------------------------------------------------------
create or replace function public.kiosk_context()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'salon_name',   s.name,
    'device_label', d.label,
    'early_minutes', s.checkin_early_minutes,
    'late_minutes',  s.checkin_late_minutes,
    'has_exit_pin',  s.kiosk_exit_pin_hash is not null
  )
  from public.kiosk_devices d
  join public.salons s on s.id = d.salon_id
  where d.id = auth.uid() and d.is_active;
$$;

revoke all on function public.kiosk_context() from public;
grant execute on function public.kiosk_context() to authenticated;

-- ----------------------------------------------------------------------------
-- Look a client up by their full number.
--
-- Three rules, all of them here rather than in the UI:
--
--   1. Ten digits or nothing. No prefix match, no name search — a kiosk that
--      answers partial numbers is a client directory with extra steps.
--   2. Eight lookups a minute per device.
--   3. The failure shape is identical whether the number exists or not: the
--      same 'no_match' with no timing branch and no extra field. A screen that
--      says "not found" differently from "found but no appointment" tells a
--      stranger which numbers are customers.
-- ----------------------------------------------------------------------------
create or replace function public.kiosk_lookup_client(p_phone text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon    uuid := public.kiosk_salon_id();
  v_digits   text := public.normalize_phone(p_phone);
  v_recent   integer;
  v_customer public.customers;
  v_matched  boolean;
  v_appt     record;
  v_now      timestamptz := now();
  v_early    integer;
  v_late     integer;
  v_result   jsonb;
begin
  if v_salon is null then
    raise exception 'This device is not set up' using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_recent
  from public.kiosk_lookups
  where kiosk_id = auth.uid() and looked_at > v_now - interval '1 minute';

  if v_recent >= 8 then
    -- Not recorded as a lookup: a blocked attempt must not extend the window.
    return jsonb_build_object('result', 'rate_limited');
  end if;

  if length(v_digits) <> 10 then
    return jsonb_build_object('result', 'no_match');
  end if;

  select s.checkin_early_minutes, s.checkin_late_minutes
    into v_early, v_late
  from public.salons s where s.id = v_salon;

  select * into v_customer
  from public.customers c
  where c.salon_id = v_salon
    and c.is_active
    and public.normalize_phone(c.phone) = v_digits
  limit 1;

  -- Captured *before* the insert below. `FOUND` is reset by every statement,
  -- including a successful INSERT — so testing it afterwards reports on the
  -- audit write rather than the client lookup, and every miss comes back as a
  -- hit with a blank name. Which is precisely the tell this function exists to
  -- avoid, so it is a variable.
  v_matched := v_customer.id is not null;

  -- Recorded before returning, so a miss counts against the limit too —
  -- otherwise wrong guesses are free and the limit protects nothing.
  insert into public.kiosk_lookups (kiosk_id, matched) values (auth.uid(), v_matched);

  if not v_matched then
    return jsonb_build_object('result', 'no_match');
  end if;

  select
    a.id,
    a.scheduled_at,
    a.status::text as status,
    a.service_name,
    coalesce(
      (select string_agg(x.name, ', ' order by x.sort_order, x.name)
         from public.appointment_services x where x.appointment_id = a.id),
      a.service_name
    ) as services,
    p.full_name as tech_name
  into v_appt
  from public.appointments a
  left join public.profiles p on p.id = a.tech_id
  cross join lateral public.salon_day_bounds(public.salon_today(v_salon)) b
  where a.salon_id = v_salon
    and a.customer_id = v_customer.id
    and a.scheduled_at >= b.starts_at
    and a.scheduled_at <  b.ends_at
    and a.status <> 'cancelled'
  order by a.scheduled_at
  limit 1;

  v_result := jsonb_build_object(
    'result',       'found',
    -- An opaque id, and only ever after a full ten-digit match. It is what
    -- lets a known client book without re-registering; on its own it reveals
    -- nothing, because the kiosk cannot read `customers` with it and
    -- `kiosk_book` re-checks that it belongs to this salon.
    'customer_id',  v_customer.id,
    'client_name',  public.mask_client_name(v_customer.name),
    'masked_phone', public.mask_phone(v_customer.phone)
  );

  if v_appt.id is null then
    -- A known client with nothing booked is a walk-in, not an error.
    return v_result || jsonb_build_object('appointment', null, 'state', 'no_appointment');
  end if;

  return v_result || jsonb_build_object(
    'appointment', jsonb_build_object(
      'id',           v_appt.id,
      'scheduled_at', v_appt.scheduled_at,
      'services',     v_appt.services,
      'tech_name',    v_appt.tech_name,
      'status',       v_appt.status
    ),
    'state', case
      when v_appt.status = 'checked_in' then 'already_checked_in'
      when v_appt.status = 'completed'  then 'already_done'
      when v_now < v_appt.scheduled_at - make_interval(mins => v_early) then 'too_early'
      when v_now > v_appt.scheduled_at + make_interval(mins => v_late)  then 'too_late'
      else 'ready'
    end,
    'minutes_until', round(extract(epoch from (v_appt.scheduled_at - v_now)) / 60)
  );
end;
$$;

revoke all on function public.kiosk_lookup_client(text) from public;
grant execute on function public.kiosk_lookup_client(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Check in.
--
-- Goes through `check_in_appointment`, the same function the front desk calls.
-- That is the whole point: the job it creates enters the rotation, appears on
-- the tech's queue and lands on the day calendar with no extra plumbing, and
-- there is one definition of what checking in means rather than two that drift.
--
-- Re-validates everything the lookup checked. The lookup's answer is a
-- suggestion the client saw thirty seconds ago; this is the decision.
-- ----------------------------------------------------------------------------
create or replace function public.kiosk_checkin(p_appointment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon uuid := public.kiosk_salon_id();
  v_appt  public.appointments;
  v_job   public.jobs;
  v_early integer;
  v_late  integer;
  v_ahead integer;
  v_tech  text;
begin
  if v_salon is null then
    raise exception 'This device is not set up' using errcode = 'insufficient_privilege';
  end if;

  select s.checkin_early_minutes, s.checkin_late_minutes into v_early, v_late
  from public.salons s where s.id = v_salon;

  select * into v_appt from public.appointments
  where id = p_appointment_id and salon_id = v_salon
  for update;

  -- Same answer for "no such booking" and "another salon's booking": the id is
  -- the only thing an attacker controls here, so it must reveal nothing.
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  if v_appt.status = 'checked_in' then
    return jsonb_build_object('result', 'already_checked_in');
  end if;

  if v_appt.status <> 'scheduled' then
    return jsonb_build_object('result', 'not_checkable');
  end if;

  if now() < v_appt.scheduled_at - make_interval(mins => v_early)
     or now() > v_appt.scheduled_at + make_interval(mins => v_late) then
    return jsonb_build_object('result', 'outside_window');
  end if;

  v_job := public.check_in_appointment(p_appointment_id);

  select full_name into v_tech from public.profiles where id = v_job.tech_id;

  -- How many are already ahead of them. The honest version of a wait estimate:
  -- a queue position the client can verify by looking around the room.
  select count(*) into v_ahead
  from public.jobs j
  where j.salon_id = v_salon
    and j.status = 'waiting'
    and j.checked_in_at < v_job.checked_in_at;

  return jsonb_build_object(
    'result',     'checked_in',
    'tech_name',  v_tech,
    'ahead',      v_ahead
  );
end;
$$;

revoke all on function public.kiosk_checkin(uuid) from public;
grant execute on function public.kiosk_checkin(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- The hidden exit.
--
-- Five taps on the logo, then this. Comparing in SQL keeps the PIN off the
-- device and out of the network response — the tablet only ever learns whether
-- it was right.
-- ----------------------------------------------------------------------------
create or replace function public.set_kiosk_exit_pin(p_pin text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_manager() then
    raise exception 'Only a manager can set the kiosk PIN'
      using errcode = 'insufficient_privilege';
  end if;

  if p_pin is null or p_pin !~ '^\d{4,8}$' then
    raise exception 'The PIN must be 4 to 8 digits' using errcode = 'check_violation';
  end if;

  update public.salons
     set kiosk_exit_pin_hash = crypt(p_pin, gen_salt('bf'))
   where id = public.current_salon_id();
end;
$$;

revoke all on function public.set_kiosk_exit_pin(text) from public;
grant execute on function public.set_kiosk_exit_pin(text) to authenticated;

create or replace function public.kiosk_check_exit_pin(p_pin text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon uuid := public.kiosk_salon_id();
  v_hash  text;
  v_tries integer;
begin
  if v_salon is null then
    return false;
  end if;

  -- The PIN pad is a lookup surface too, so it shares the same budget.
  select count(*) into v_tries
  from public.kiosk_lookups
  where kiosk_id = auth.uid() and looked_at > now() - interval '1 minute';

  if v_tries >= 8 then
    return false;
  end if;

  insert into public.kiosk_lookups (kiosk_id, matched) values (auth.uid(), false);

  select kiosk_exit_pin_hash into v_hash from public.salons where id = v_salon;
  if v_hash is null then
    return false;
  end if;

  return crypt(p_pin, v_hash) = v_hash;
end;
$$;

revoke all on function public.kiosk_check_exit_pin(text) from public;
grant execute on function public.kiosk_check_exit_pin(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Registering a device. Manager only.
--
-- The auth user is created by the app with the service-role key; this attaches
-- the profile and the device row in one step so a half-made kiosk — an auth
-- user with no profile, which would sit in a redirect loop — cannot exist.
-- ----------------------------------------------------------------------------
create or replace function public.register_kiosk_device(
  p_user_id uuid,
  p_label   text
)
returns public.kiosk_devices
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row   public.kiosk_devices;
  v_salon uuid := public.current_salon_id();
  v_label text := nullif(trim(coalesce(p_label, '')), '');
begin
  if not public.is_manager() then
    raise exception 'Only a manager can add a kiosk' using errcode = 'insufficient_privilege';
  end if;

  if v_label is null then
    raise exception 'Give the device a name, like "Front desk iPad"'
      using errcode = 'check_violation';
  end if;

  insert into public.profiles (id, salon_id, full_name, role, is_active)
  values (p_user_id, v_salon, v_label, 'kiosk', true)
  on conflict (id) do update set role = 'kiosk', salon_id = v_salon, full_name = v_label;

  insert into public.kiosk_devices (id, salon_id, label, created_by)
  values (p_user_id, v_salon, v_label, auth.uid())
  on conflict (id) do update set label = v_label, is_active = true
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.register_kiosk_device(uuid, text) from public;
grant execute on function public.register_kiosk_device(uuid, text) to authenticated;
