-- ============================================================================
-- Zolvora: outstanding migrations 26-34, in order, as ONE paste.
-- The SQL editor runs a paste as a single transaction: if anything fails,
-- NOTHING is applied — so this is safe to retry after a fix.
-- After it succeeds, run supabase/check-migrations.sql: 34 rows of 'ok'.
-- ============================================================================


-- ▶▶▶ 20260728250000_client_search.sql ▶▶▶

-- ============================================================================
-- One client search, server-side, for every place staff pick somebody.
--
-- What it replaces: three `<select>` elements, each fed by a query that shipped
-- up to five hundred clients to the browser and filtered them there. That is
-- fine at fifty clients and a liability at five thousand — and it put every
-- client's name and phone number into the page source of every booking form.
--
-- ---------------------------------------------------------------------------
-- Accents are the main failure mode, not an edge case
-- ---------------------------------------------------------------------------
-- Most of this client list will have Vietnamese names. A receptionist types
-- "nguyen" on a US keyboard and the record says "Nguyễn"; a search that misses
-- that is a search that creates a duplicate client every single time. So both
-- sides are unaccented, and the index is built on the unaccented form — which
-- is the reason for the IMMUTABLE wrapper below.
-- ============================================================================

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- ----------------------------------------------------------------------------
-- `unaccent()` ships as STABLE, not IMMUTABLE, because it reads a dictionary
-- that could in principle be changed. Postgres therefore refuses to build an
-- index on an expression containing it. The two-argument form names the
-- dictionary explicitly, which is what makes pinning it honest rather than a
-- lie to the planner.
--
-- Without this the expression index below simply cannot be created, and the
-- search falls back to a sequential scan on every keystroke.
-- ----------------------------------------------------------------------------
create or replace function public.immutable_unaccent(text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select public.unaccent('public.unaccent', $1);
$$;

/** The form every name comparison happens in: unaccented, lower, trimmed. */
create or replace function public.search_name(p_first text, p_last text, p_name text)
returns text
language sql
immutable
parallel safe
as $$
  select public.immutable_unaccent(lower(trim(
    coalesce(nullif(trim(coalesce(p_first, '') || ' ' || coalesce(p_last, '')), ''),
             coalesce(p_name, ''))
  )));
$$;

/** Digits only. The one form a phone is ever compared in. */
create or replace function public.phone_digits(p_phone text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
$$;

-- ----------------------------------------------------------------------------
-- Indexes.
--
-- Trigram GIN on both, because staff search by fragments: the middle of a name,
-- or the last four digits of a number they read off a text message. A b-tree
-- would serve `LIKE 'nguy%'` and nothing else, and "I only have the last 4" is
-- the single most common thing a front desk has.
-- ----------------------------------------------------------------------------
create index if not exists customers_search_name_trgm
  on public.customers
  using gin (public.search_name(first_name, last_name, name) gin_trgm_ops);

create index if not exists customers_phone_digits_trgm
  on public.customers
  using gin (public.phone_digits(phone) gin_trgm_ops);

-- Exact-suffix and exact-match lookups get a plain b-tree too: a full ten-digit
-- number should not need a trigram scan to find one row.
create index if not exists customers_phone_digits_idx
  on public.customers (public.phone_digits(phone));

analyze public.customers;

-- ----------------------------------------------------------------------------
-- The search.
--
-- Staff and managers only. A kiosk must never reach this: partial matching over
-- names is precisely the capability the kiosk was built without, and a device
-- in a waiting room with a name search on it is a client directory.
--
-- `SECURITY DEFINER` means RLS does not gate it, so the role check is explicit
-- and comes first.
-- ----------------------------------------------------------------------------
create or replace function public.staff_search_clients(
  q     text default '',
  lim   integer default 10
)
returns table (
  id           uuid,
  first_name   text,
  last_name    text,
  phone_last4  text,
  last_visit   date,
  usual_tech   text,
  is_active    boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon  uuid := public.current_salon_id();
  v_q      text := trim(coalesce(q, ''));
  v_digits text;
  v_name   text;
  v_lim    integer := least(greatest(coalesce(lim, 10), 1), 50);
begin
  -- Explicit, and named. `not is_manager()` would have let the kiosk through.
  --
  -- `profiles` is aliased because this function's OUT parameters are called
  -- `id` and `is_active`, and inside the body those shadow the table's columns
  -- of the same name — an unqualified `where id = auth.uid()` is ambiguous and
  -- fails at call time rather than at creation time.
  if public.is_kiosk() or not exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active
      and pr.role::text in ('manager', 'admin', 'super_admin', 'tech')
  ) then
    raise exception 'Not permitted to search clients'
      using errcode = 'insufficient_privilege';
  end if;

  if v_salon is null then
    return;
  end if;

  v_digits := public.phone_digits(v_q);
  -- Digits-only after stripping formatting: they are searching by number.
  -- "(555) 210" and "5552104477" and "4142" all land here.
  v_name := public.immutable_unaccent(lower(v_q));

  return query
  -- Two passes, and the split is the whole performance story.
  --
  -- Ranking is cheap: string comparisons against an indexed expression. Last
  -- visit and usual tech are a subquery each, per row. Computing them for
  -- every match before limiting meant a search for a common surname — 9,500
  -- Nguyễns in a 50,000-client salon — did 9,500 subqueries to return ten
  -- rows, and took 107ms. Ranking first and enriching only the survivors takes
  -- it to single digits.
  --
  -- The cost: for a query matching more than POOL rows, "most recent visit"
  -- orders within the pool rather than globally. That is a real approximation
  -- and worth naming — but a query matching two hundred people is one where
  -- the operator is going to type another letter, not scroll.
  with scored as (
    select
      c.id,
      c.first_name,
      c.last_name,
      c.name,
      c.phone,
      c.is_active,
      c.preferred_tech_id,
      case
        -- Exact phone first: if they typed the whole number they know who
        -- they mean, and anything else on screen is noise.
        when v_digits <> '' and n.pd = v_digits            then 0
        when v_digits <> '' and n.pd like v_digits || '%'  then 1
        when v_digits <> '' and n.pd like '%' || v_digits  then 2
        when v_digits <> '' and n.pd like '%' || v_digits || '%' then 3
        when v_name  <> '' and n.sn like v_name || '%'     then 4
        when v_name  <> '' and n.sn like '%' || v_name || '%' then 5
        else 9
      end as rank
    from public.customers c
    -- Normalise once per row.
    --
    -- `search_name` unaccents and lowercases, and the ranking CASE below
    -- referenced it six times. Postgres does not memoise that: a search for a
    -- common surname across fifty thousand clients was calling it tens of
    -- thousands of times and spending 146ms doing string work rather than
    -- index work. Hoisting it into a lateral makes it once.
    cross join lateral (
      select public.search_name(c.first_name, c.last_name, c.name) as sn,
             public.phone_digits(c.phone) as pd
    ) n
    where c.salon_id = v_salon
      and (
        v_q = ''
        or (
          -- A query of pure digits is a phone search and nothing else. Letting
          -- it also match names means "4142" surfaces everyone with a house
          -- number in a note field.
          v_digits <> ''
          and v_digits = regexp_replace(v_q, '\D', '', 'g')
          and n.pd like '%' || v_digits || '%'
        )
        or (v_digits = '' and n.sn like '%' || v_name || '%')
      )
  ),
  pool as (
    select s.*
    from scored s
    where s.rank < 9 or v_q = ''
    order by s.rank, s.first_name
    limit 200
  ),
  enriched as (
    select
      p.*,
      (select max(a.scheduled_at)::date
         from public.appointments a
        where a.customer_id = p.id
          and a.status in ('completed', 'checked_in')) as visited_on,
      (select pr.full_name from public.profiles pr where pr.id = p.preferred_tech_id) as tech_name
    from pool p
  )
  select
    e.id,
    -- Fall back to splitting `name` for records created before the split
    -- existed, so an old client is not a blank row.
    coalesce(e.first_name, split_part(trim(e.name), ' ', 1)),
    coalesce(e.last_name, nullif(regexp_replace(trim(e.name), '^\S+\s*', ''), '')),
    -- Last four only. Enough to tell two Maria G.s apart, not enough to be a
    -- phone list.
    nullif(right(public.phone_digits(e.phone), 4), ''),
    e.visited_on,
    e.tech_name,
    e.is_active
  from enriched e
  order by
    e.rank,
    -- Then whoever was seen most recently: the person in front of you is far
    -- more likely to be a regular than someone from three years ago.
    e.visited_on desc nulls last,
    e.first_name
  limit v_lim;
end;
$$;

revoke all on function public.staff_search_clients(text, integer) from public;
grant execute on function public.staff_search_clients(text, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- Today's clients, for the empty state.
--
-- An empty search box showing an empty panel is a dead end. Most of the time
-- the person being picked is already on today's book.
-- ----------------------------------------------------------------------------
create or replace function public.staff_recent_clients(lim integer default 8)
returns table (
  id           uuid,
  first_name   text,
  last_name    text,
  phone_last4  text,
  last_visit   date,
  usual_tech   text,
  is_active    boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon uuid := public.current_salon_id();
begin
  if public.is_kiosk() or v_salon is null then
    raise exception 'Not permitted to list clients'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  with seen as (
    select a.customer_id, max(a.scheduled_at) as at
    from public.appointments a
    cross join lateral public.salon_day_bounds(public.salon_today(v_salon)) b
    where a.salon_id = v_salon and a.scheduled_at >= b.starts_at and a.scheduled_at < b.ends_at
    group by a.customer_id
    union all
    select j.customer_id, max(j.checked_in_at)
    from public.jobs j
    where j.salon_id = v_salon
      and j.checked_in_at >= public.salon_day_start(v_salon)
    group by j.customer_id
  ),
  ranked as (
    select customer_id, max(at) as at from seen group by customer_id
  )
  select
    c.id,
    coalesce(c.first_name, split_part(trim(c.name), ' ', 1)),
    coalesce(c.last_name, nullif(regexp_replace(trim(c.name), '^\S+\s*', ''), '')),
    nullif(right(public.phone_digits(c.phone), 4), ''),
    r.at::date,
    (select p.full_name from public.profiles p where p.id = c.preferred_tech_id),
    c.is_active
  from ranked r
  join public.customers c on c.id = r.customer_id
  order by r.at desc
  limit least(greatest(coalesce(lim, 8), 1), 25);
end;
$$;

revoke all on function public.staff_recent_clients(integer) from public;
grant execute on function public.staff_recent_clients(integer) to authenticated;


-- ▶▶▶ 20260728260000_rotation_salon_clock.sql ▶▶▶

-- ============================================================================
-- The rotation empties every evening.
--
-- Reproduced, 9:34pm on a Tuesday in New York — a perfectly ordinary moment to
-- be checking someone in:
--
--   now() UTC          2026-07-31 01:34
--   now() in the salon 2026-07-30 21:34
--   current_date       2026-07-31        <- Postgres, in UTC
--   salon_today()      2026-07-30        <- the salon's actual day
--
--   check_in_for_turns writes checkin_date = 2026-07-30   (the salon's day)
--   turn_queue looks   for  checkin_date = current_date   (UTC's day)
--
--   -> is_checked_in    false
--   -> queue_position   null
--   -> suggest_next_tech NOBODY
--
-- So a tech taps "check in", the board does not change, and they tap it again.
-- The write was never lost — it was filed under the right date and read back
-- under the wrong one. On a US salon this is every evening after 8pm; on a
-- UTC+ salon it is every morning before opening.
--
-- `salon_today()` and `salon_day_start()` already exist and already do this
-- correctly. `today_stats()` was converted to them when this class of bug was
-- first found; `turn_queue` and `am_i_checked_in` were missed, which is why
-- the counters agreed and the board did not.
--
-- Read-only change to two functions. No table, column or policy is touched.
-- ============================================================================

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
  is_booked_now  boolean,
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
  clock as (
    -- Resolved once, from the salon's timezone, and used for every "today"
    -- below. Two different notions of today in one query is how the board and
    -- the counters came to disagree in the first place.
    select public.salon_today((select id from salon))     as today,
           public.salon_day_start((select id from salon)) as day_start
  ),
  techs as (
    select p.id, p.full_name, p.last_turn_at, p.created_at, p.skills,
           exists (
             select 1 from public.turn_checkins c, clock k
             where c.tech_id = p.id
               -- Was `current_date`, which is UTC. `check_in_for_turns` has
               -- always written the salon's date, so the two only matched
               -- during the hours the salon's date happened to equal UTC's.
               and c.checkin_date = k.today
               and c.checked_out_at is null
           ) as is_checked_in,
           exists (
             select 1 from public.schedule_blocks b
             where b.tech_id = p.id
               and now() >= b.blocked_from
               and now() <  b.blocked_to
           ) as is_booked_now
    from public.profiles p, salon s
    where p.salon_id = s.id
      and p.role::text = 'tech'
      and p.is_active
      and s.id = public.current_salon_id()
  ),
  stats as (
    select
      t.id,
      count(*) filter (where j.status = 'in_progress') > 0 as is_busy,
      count(*) filter (where j.status = 'waiting')::int as waiting_jobs,
      count(*) filter (
        -- Same fix: this counted from UTC midnight, so a tech's "done today"
        -- reset four hours before their day did.
        where j.status = 'completed' and j.completed_at >= (select day_start from clock)
      )::int as jobs_today
    from techs t
    left join public.jobs j on j.tech_id = t.id
    group by t.id
  ),
  scored as (
    select
      t.id, t.full_name, t.last_turn_at, t.created_at, t.skills,
      t.is_checked_in, t.is_booked_now,
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
    id, full_name, last_turn_at, is_busy, is_checked_in, is_booked_now,
    has_skills, skills, waiting_jobs, jobs_today,
    case
      when is_checked_in then
        (row_number() over (
          partition by is_checked_in
          order by
            -- Never had a turn goes first, then longest since their last one.
            last_turn_at asc nulls first,
            created_at asc
        ))::int
      else null
    end
  from scored
  order by
    is_checked_in desc,
    last_turn_at asc nulls first,
    created_at asc;
$$;

revoke all on function public.turn_queue(uuid, public.skill[]) from public;
grant execute on function public.turn_queue(uuid, public.skill[]) to authenticated;

-- ----------------------------------------------------------------------------
-- The tech's own screen had the same bug, which is what made it confusing
-- rather than merely wrong: they tapped "check in", their own screen still
-- said they were not checked in, so they tapped it again.
-- ----------------------------------------------------------------------------
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
      and checkin_date = public.salon_today()
      and checked_out_at is null
  );
$$;

revoke all on function public.am_i_checked_in() from public;
grant execute on function public.am_i_checked_in() to authenticated;


-- ▶▶▶ 20260728270000_kiosk_accounts.sql ▶▶▶

-- ============================================================================
-- A kiosk is an account you log into, not a device you provision.
--
-- The hole this closes: `ROLE_LABEL` gained "Kiosk device", so the Staff page's
-- role dropdown offered it — but only `register_kiosk_device()` created the
-- `kiosk_devices` row, and the Staff form never called it. Picking Kiosk there
-- produced an account that:
--
--   * had a profile with role = 'kiosk'          (so it could sign in)
--   * was locked to /kiosk by the middleware     (so it could go nowhere else)
--   * had no kiosk_devices row                   (so kiosk_salon_id() was NULL)
--   * and every screen answered "This device is not set up"
--
-- Reproduced before writing this: is_kiosk() true, kiosk_salon_id() null,
-- kiosk_lookup_client() raising insufficient_privilege. A dead tablet.
--
-- The fix is a trigger rather than another call site. Two ways to make a kiosk
-- means one of them will be forgotten again — and the next one will not be the
-- Staff form, it will be somebody changing a role in the database by hand.
-- ============================================================================

create or replace function public.sync_kiosk_device()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role::text = 'kiosk' then
    -- The profile's name is the device's label. On the Staff form that field
    -- is "Full name", which for a tablet is where somebody types "Front desk
    -- iPad" — so the two are the same thing and should not be asked twice.
    insert into public.kiosk_devices (id, salon_id, label, created_by)
    values (new.id, new.salon_id, coalesce(nullif(trim(new.full_name), ''), 'Kiosk'), auth.uid())
    on conflict (id) do update
      set salon_id  = excluded.salon_id,
          label     = excluded.label,
          -- Re-selecting the Kiosk role for an account that was switched off
          -- is a deliberate act; treat it as switching the device back on.
          is_active = true;

  elsif tg_op = 'UPDATE' and old.role::text = 'kiosk' then
    -- Demoted out of the kiosk role. The device row stops being meaningful, and
    -- leaving it active would let `kiosk_salon_id()` keep resolving if the role
    -- were ever set back without going through here.
    update public.kiosk_devices set is_active = false where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_sync_kiosk_device on public.profiles;
create trigger profiles_sync_kiosk_device
  after insert or update of role, full_name, salon_id on public.profiles
  for each row execute function public.sync_kiosk_device();

-- Backfill: any kiosk profile already created through the Staff form is
-- currently a dead tablet. Give it its device row.
insert into public.kiosk_devices (id, salon_id, label)
select p.id, p.salon_id, coalesce(nullif(trim(p.full_name), ''), 'Kiosk')
from public.profiles p
where p.role::text = 'kiosk'
  and not exists (select 1 from public.kiosk_devices d where d.id = p.id);

-- ----------------------------------------------------------------------------
-- Which salon a kiosk belongs to, for the screen it lands on after signing in.
--
-- `kiosk_context()` deliberately returns nothing for a switched-off device, so
-- the lobby cannot use it to say "this tablet is switched off" — it would get
-- null and have nothing to show. This one always answers, so the screen can
-- explain itself rather than appearing broken.
-- ----------------------------------------------------------------------------
create or replace function public.kiosk_account()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'salon_name',   s.name,
    'device_label', coalesce(d.label, p.full_name),
    'is_active',    coalesce(d.is_active, false),
    'has_device',   d.id is not null,
    'has_exit_pin', s.kiosk_exit_pin_hash is not null
  )
  from public.profiles p
  join public.salons s on s.id = p.salon_id
  left join public.kiosk_devices d on d.id = p.id
  where p.id = auth.uid() and p.role::text = 'kiosk';
$$;

revoke all on function public.kiosk_account() from public;
grant execute on function public.kiosk_account() to authenticated;


-- ▶▶▶ 20260728280000_kiosk_mode.sql ▶▶▶

-- ============================================================================
-- Kiosk mode: a session downgrade any role can enter, and a guarded way out.
--
-- Two things this adds, and one dead end it closes.
--
-- The dead end: the middleware sent a kiosk account to /kiosk — the locked
-- customer screen — the instant it signed in, so the lobby added last time was
-- unreachable. The exit hatch is disabled until a PIN exists, and there is no
-- way to set a PIN before first sign-in. A tablet signed in, locked, with no
-- exit. That part is fixed in the middleware, not here.
--
-- What is here:
--
--   * PIN attempts and lockout, counted server-side. A PIN pad that counts in
--     the browser is a PIN pad with no lockout, because the browser is the
--     thing being attacked.
--   * `kiosk_devices.entered_kiosk_mode_at` / `last_sign_in_at`, so the manager
--     list can say which tablets are actually locked right now.
--
-- The kiosk_mode flag itself is NOT stored here. It lives in a signed httpOnly
-- cookie so that middleware can read it without a database round trip on every
-- request — see `src/lib/kiosk-mode.ts`. What the database owns is the PIN that
-- clears it and the lockout that rate-limits guessing.
-- ============================================================================

alter table public.kiosk_devices
  add column if not exists last_sign_in_at        timestamptz,
  add column if not exists entered_kiosk_mode_at  timestamptz;

-- ----------------------------------------------------------------------------
-- Wrong-PIN attempts.
--
-- Keyed by device rather than by account: the lockout has to bite the tablet
-- somebody is holding, and a manager who starts kiosk mode on their own phone
-- gets their own bucket. `device_key` is the signed cookie's id, so clearing
-- cookies starts a fresh bucket — which is fine, because it also drops them out
-- of kiosk mode, which is the thing the PIN was protecting.
-- ----------------------------------------------------------------------------
create table if not exists public.kiosk_pin_attempts (
  id          bigserial primary key,
  salon_id    uuid not null references public.salons(id) on delete cascade,
  device_key  text not null,
  attempted_at timestamptz not null default now(),
  succeeded   boolean not null
);

create index if not exists kiosk_pin_attempts_recent_idx
  on public.kiosk_pin_attempts (device_key, attempted_at desc);

alter table public.kiosk_pin_attempts enable row level security;

drop policy if exists "managers can review pin attempts" on public.kiosk_pin_attempts;
create policy "managers can review pin attempts"
  on public.kiosk_pin_attempts for select
  to authenticated
  using (salon_id = public.current_salon_id() and public.is_manager());

grant select on public.kiosk_pin_attempts to authenticated;

-- ----------------------------------------------------------------------------
-- Check the exit PIN.
--
-- Replaces `kiosk_check_exit_pin`, which returned a bare boolean and shared the
-- lookup rate limiter. This one:
--
--   * works for ANY signed-in role, because a manager who started kiosk mode on
--     the front tablet needs the same way out as the tablet's own account;
--   * counts attempts per device, five then five minutes;
--   * never says how many attempts are left. "Wrong PIN" and "wrong PIN, two
--     to go" are different amounts of help to someone guessing.
-- ----------------------------------------------------------------------------
create or replace function public.kiosk_verify_exit_pin(
  p_pin        text,
  p_device_key text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon  uuid := public.current_salon_id();
  v_hash   text;
  v_recent integer;
  v_key    text := coalesce(nullif(trim(p_device_key), ''), 'unknown');
  v_ok     boolean;
begin
  if v_salon is null then
    return jsonb_build_object('result', 'denied');
  end if;

  -- Failures inside the window only. A success clears the slate below, so a
  -- day of ordinary use never accumulates toward a lockout.
  select count(*) into v_recent
  from public.kiosk_pin_attempts a
  where a.device_key = v_key
    and not a.succeeded
    and a.attempted_at > now() - interval '5 minutes';

  if v_recent >= 5 then
    return jsonb_build_object('result', 'locked_out');
  end if;

  select s.kiosk_exit_pin_hash into v_hash from public.salons s where s.id = v_salon;

  if v_hash is null then
    -- No PIN set. Refusing here would strand whoever is holding the tablet,
    -- and the screen that let them start kiosk mode warned them about exactly
    -- this — so it is a distinct answer the UI can explain, not a failure.
    return jsonb_build_object('result', 'no_pin');
  end if;

  v_ok := crypt(p_pin, v_hash) = v_hash;

  insert into public.kiosk_pin_attempts (salon_id, device_key, succeeded)
  values (v_salon, v_key, v_ok);

  if v_ok then
    delete from public.kiosk_pin_attempts where device_key = v_key and not succeeded;
    return jsonb_build_object('result', 'ok');
  end if;

  return jsonb_build_object('result', 'wrong');
end;
$$;

revoke all on function public.kiosk_verify_exit_pin(text, text) from public;
grant execute on function public.kiosk_verify_exit_pin(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Record that a device entered or left kiosk mode, for the manager list.
--
-- Only meaningful for a kiosk-role account: a manager who starts kiosk mode on
-- their own phone has no device row, and inventing one would put a phone in a
-- list of tablets. They are standing next to it and hold the PIN.
-- ----------------------------------------------------------------------------
create or replace function public.kiosk_mark_mode(p_entered boolean)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.kiosk_devices
     set entered_kiosk_mode_at = case when p_entered then now() else null end,
         last_sign_in_at = coalesce(last_sign_in_at, now())
   where id = auth.uid();
$$;

revoke all on function public.kiosk_mark_mode(boolean) from public;
grant execute on function public.kiosk_mark_mode(boolean) to authenticated;

/** Stamp a sign-in, so the manager list can show when a tablet was last used. */
create or replace function public.kiosk_touch_sign_in()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.kiosk_devices set last_sign_in_at = now() where id = auth.uid();
$$;

revoke all on function public.kiosk_touch_sign_in() from public;
grant execute on function public.kiosk_touch_sign_in() to authenticated;


-- ▶▶▶ 20260728290000_pgcrypto_search_path.sql ▶▶▶

-- ============================================================================
-- The kiosk PIN could not be saved. SQLSTATE 42883.
--
--   ERROR:  function gen_salt(unknown) does not exist
--
-- Not RLS, not the column, not validation. `set_kiosk_exit_pin` declares
--
--   SET search_path TO 'public'
--
-- and on Supabase `pgcrypto` is installed into the `extensions` schema, not
-- `public`. So `crypt()` and `gen_salt()` are simply not on the path inside the
-- function, and every PIN save failed the moment it tried to hash.
--
-- Why every test passed: the local harness these were developed against creates
-- pgcrypto with `create extension if not exists pgcrypto`, which lands it in
-- `public`. The functions worked there and nowhere else. Reproduced by moving
-- the extension to `extensions` and re-running the save — 42883, immediately.
--
-- The fix is the search_path, on all three functions that hash or compare:
-- setting the PIN, and the two that check it. `public, extensions` rather than
-- just `extensions`, because a project where pgcrypto really is in `public`
-- must keep working — including the local harness, so the tests keep testing
-- the same code that runs in production.
--
-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--   Re-run 20260728230000_kiosk.sql and 20260728280000_kiosk_mode.sql, which
--   contain the previous definitions. Nothing here changes a table, a column,
--   a policy or a row — only the search_path of three function bodies.
-- ============================================================================

-- Belt and braces: if the extension is missing entirely, create it where the
-- functions can see it. A no-op on Supabase, where it already exists.
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Set the salon's kiosk exit PIN.
--
-- Text, not an integer: "0042" is a valid PIN and an integer column would store
-- it as 42 and hand back "42" — a PIN that can never be entered correctly again.
-- It is bcrypt-hashed here and the plaintext is never stored, never returned,
-- and never leaves this function.
-- ----------------------------------------------------------------------------
create or replace function public.set_kiosk_exit_pin(p_pin text)
returns void
language plpgsql
volatile
security definer
-- The fix. `extensions` is where Supabase keeps pgcrypto.
set search_path = public, extensions
as $$
begin
  if not public.is_manager() then
    raise exception 'Only the owner can set the kiosk PIN'
      using errcode = 'insufficient_privilege';
  end if;

  -- 4 to 6 digits. Leading zeros are preserved because this is compared as
  -- text and hashed as text; nothing ever parses it as a number.
  if p_pin is null or p_pin !~ '^\d{4,6}$' then
    raise exception 'The PIN must be 4 to 6 digits' using errcode = 'check_violation';
  end if;

  update public.salons
     set kiosk_exit_pin_hash = crypt(p_pin, gen_salt('bf'))
   where id = public.current_salon_id();
end;
$$;

revoke all on function public.set_kiosk_exit_pin(text) from public;
grant execute on function public.set_kiosk_exit_pin(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Verify it. Same search_path fix; `crypt()` here had the same problem, so the
-- exit would have failed even for a PIN saved before this regression existed.
-- ----------------------------------------------------------------------------
create or replace function public.kiosk_verify_exit_pin(
  p_pin        text,
  p_device_key text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_salon  uuid := public.current_salon_id();
  v_hash   text;
  v_recent integer;
  v_key    text := coalesce(nullif(trim(p_device_key), ''), 'unknown');
  v_ok     boolean;
begin
  if v_salon is null then
    return jsonb_build_object('result', 'denied');
  end if;

  select count(*) into v_recent
  from public.kiosk_pin_attempts a
  where a.device_key = v_key
    and not a.succeeded
    and a.attempted_at > now() - interval '5 minutes';

  if v_recent >= 5 then
    return jsonb_build_object('result', 'locked_out');
  end if;

  select s.kiosk_exit_pin_hash into v_hash from public.salons s where s.id = v_salon;

  if v_hash is null then
    return jsonb_build_object('result', 'no_pin');
  end if;

  v_ok := crypt(p_pin, v_hash) = v_hash;

  insert into public.kiosk_pin_attempts (salon_id, device_key, succeeded)
  values (v_salon, v_key, v_ok);

  if v_ok then
    delete from public.kiosk_pin_attempts where device_key = v_key and not succeeded;
    return jsonb_build_object('result', 'ok');
  end if;

  return jsonb_build_object('result', 'wrong');
end;
$$;

revoke all on function public.kiosk_verify_exit_pin(text, text) from public;
grant execute on function public.kiosk_verify_exit_pin(text, text) to authenticated;

-- The original single-argument checker, kept working for the same reason.
create or replace function public.kiosk_check_exit_pin(p_pin text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_salon uuid := public.kiosk_salon_id();
  v_hash  text;
begin
  if v_salon is null then
    return false;
  end if;

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
-- Does this salon have a PIN? A boolean, so the hash never leaves the server
-- to answer a question the UI only needs one bit for.
--
-- Exists so the ready screen can refuse to start kiosk mode without one:
-- shipping a kiosk with no exit is shipping a bricked tablet.
-- ----------------------------------------------------------------------------
create or replace function public.salon_has_exit_pin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.kiosk_exit_pin_hash is not null
       from public.salons s
      where s.id = coalesce(public.kiosk_salon_id(), public.current_salon_id())),
    false
  );
$$;

revoke all on function public.salon_has_exit_pin() from public;
grant execute on function public.salon_has_exit_pin() to authenticated;


-- ▶▶▶ 20260728300000_zolvora_default_theme.sql ▶▶▶

-- ============================================================================
-- Rebrand: the salon default theme becomes 'zolvora'.
--
-- The app ships a new brand theme derived from the Zolvora logo, and the
-- resolution order (user override → salon default → brand default) means the
-- mounted front-desk tablet shows whatever the salon default says. Every salon
-- row currently carries 'midnight-plum' because that was the column default —
-- not because anyone chose it — so this flips exactly those rows and leaves
-- any other stored value alone.
--
-- Per-user theme choices are NOT touched: a user's theme is always an explicit
-- pick, and the rebrand has no business overriding a person's own setting.
-- 'midnight-plum' remains a valid, selectable theme after this.
--
-- The column's DEFAULT clause is left as-is (no ALTER on existing columns, per
-- the standing constraint); instead `bootstrap_salon` — the only path that
-- creates a salon — now sets the theme explicitly on insert.
--
-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--   update public.salons set default_theme = 'midnight-plum'
--    where default_theme = 'zolvora';
--   and re-run 20260728100000_commission_and_super_admin.sql to restore the
--   previous bootstrap_salon body. Nothing structural changes here.
-- ============================================================================

update public.salons
   set default_theme = 'zolvora'
 where default_theme = 'midnight-plum';

-- Same body as 20260728100000, plus the explicit default_theme on the insert.
create or replace function public.bootstrap_salon(
  p_salon_name text,
  p_full_name  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_email    text;
  v_existing uuid;
  v_salon_id uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in.' using errcode = 'insufficient_privilege';
  end if;

  select salon_id into v_existing from public.profiles where id = v_uid;
  if v_existing is not null then
    return v_existing;
  end if;

  if nullif(trim(coalesce(p_salon_name, '')), '') is null then
    raise exception 'A salon name is required.' using errcode = 'check_violation';
  end if;

  select email into v_email from auth.users where id = v_uid;

  insert into public.salons (name, default_theme)
  values (trim(p_salon_name), 'zolvora')
  returning id into v_salon_id;

  insert into public.profiles (id, salon_id, full_name, role)
  values (
    v_uid,
    v_salon_id,
    coalesce(
      nullif(trim(coalesce(p_full_name, '')), ''),
      nullif(split_part(coalesce(v_email, ''), '@', 1), ''),
      'Owner'
    ),
    'super_admin'
  );

  return v_salon_id;
end;
$$;

revoke all on function public.bootstrap_salon(text, text) from public;
grant execute on function public.bootstrap_salon(text, text) to authenticated;


-- ▶▶▶ 20260728310000_tenancy.sql ▶▶▶

-- ============================================================================
-- Tenancy: one deployment, one database, many salons.
--
-- What this adds to `salons`:
--
--   slug           the subdomain: {slug}.<root-domain> resolves to this row.
--                  Backfilled from the name, then locked NOT NULL + unique.
--   custom_domain  the seam for later (book.lotusnails.com -> salon). Nothing
--                  reads it yet; it exists so mapping a domain later is an
--                  UPDATE, not a rearchitecture. Unique when present.
--   suspended_at   a suspended salon keeps every row it owns; its people see
--                  a status screen instead of the floor. NULL = active.
--
-- And one function: `salon_by_slug` — the ONLY thing the anonymous edge
-- middleware may ask, answering only what a login screen needs. It never
-- returns money, settings, or the roster, and asking about a slug that does
-- not exist returns NULL rather than an error, so probing learns nothing an
-- HTTP 404 would not say.
--
-- The slug is NOT a security boundary. Isolation stays where it has always
-- been: auth.uid() -> current_salon_id() under RLS. The slug picks which
-- login screen you are looking at.
--
-- Rollback: alter table public.salons drop column slug, drop column
-- custom_domain, drop column suspended_at; drop function
-- public.salon_by_slug(text); drop function public.slugify(text);
-- ============================================================================

-- ----------------------------------------------------------------------------
-- slugify: display name -> url-safe slug. Deterministic, additive-safe.
-- ----------------------------------------------------------------------------
create or replace function public.slugify(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'),
      '-{2,}', '-', 'g'
    )
  );
$$;

-- ----------------------------------------------------------------------------
-- Columns
-- ----------------------------------------------------------------------------
alter table public.salons add column if not exists slug text;
alter table public.salons add column if not exists custom_domain text;
alter table public.salons add column if not exists suspended_at timestamptz;

-- Backfill existing rows: slug from the name; on collision, disambiguate with
-- a fragment of the id. Row-by-row so two "Lotus Nails" both get a slug.
do $$
declare
  r record;
  v_slug text;
begin
  for r in select id, name from public.salons where slug is null loop
    v_slug := nullif(public.slugify(r.name), '');
    if v_slug is null or exists (select 1 from public.salons s where s.slug = v_slug) then
      v_slug := coalesce(nullif(v_slug, '') || '-', 'salon-') || left(replace(r.id::text, '-', ''), 6);
    end if;
    update public.salons set slug = v_slug where id = r.id;
  end loop;
end $$;

alter table public.salons alter column slug set not null;

-- Shape, length, and the names the platform itself squats on. `www` and the
-- apex are the marketing entry; `admin` is the console; the rest are the
-- usual infrastructure names nobody should be able to wear as a costume.
do $$ begin
  alter table public.salons add constraint salons_slug_shape
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 50);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.salons add constraint salons_slug_reserved
    check (slug not in ('www', 'admin', 'app', 'api', 'auth', 'login', 'kiosk',
                        'mail', 'smtp', 'status', 'help', 'support', 'billing'));
exception when duplicate_object then null; end $$;

create unique index if not exists salons_slug_key on public.salons (slug);
create unique index if not exists salons_custom_domain_key
  on public.salons (custom_domain) where custom_domain is not null;

-- New rows: a slug is derived from the name when none is given, so every
-- existing creation path (and any future one) cannot mint a slugless salon.
-- Collisions get an id fragment, same rule as the backfill.
create or replace function public.salons_derive_slug()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_slug text;
begin
  if new.slug is not null then
    return new;
  end if;
  v_slug := nullif(public.slugify(new.name), '');
  if v_slug is null or char_length(v_slug) < 2
     or exists (select 1 from public.salons s where s.slug = v_slug)
     or v_slug in ('www', 'admin', 'app', 'api', 'auth', 'login', 'kiosk',
                   'mail', 'smtp', 'status', 'help', 'support', 'billing') then
    v_slug := coalesce(nullif(v_slug, '') || '-', 'salon-')
      || left(replace(new.id::text, '-', ''), 6);
  end if;
  new.slug := v_slug;
  return new;
end;
$$;

drop trigger if exists salons_derive_slug on public.salons;
create trigger salons_derive_slug
  before insert on public.salons
  for each row execute function public.salons_derive_slug();

-- The slug is the salon's address; letting an owner edit it breaks every
-- bookmark, QR code and printed card the salon has. Platform admin only.
create or replace function public.salons_guard_slug()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.slug is distinct from old.slug and not public.is_super_admin() then
    raise exception 'Only the platform admin can change a salon''s address'
      using errcode = 'insufficient_privilege';
  end if;
  if new.custom_domain is distinct from old.custom_domain and not public.is_super_admin() then
    raise exception 'Only the platform admin can change a salon''s domain'
      using errcode = 'insufficient_privilege';
  end if;
  if new.suspended_at is distinct from old.suspended_at and not public.is_super_admin() then
    raise exception 'Only the platform admin can suspend or reactivate a salon'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists salons_guard_slug on public.salons;
create trigger salons_guard_slug
  before update on public.salons
  for each row execute function public.salons_guard_slug();

-- ----------------------------------------------------------------------------
-- The public lookup. Runs anonymously in edge middleware on every request to
-- a subdomain, so it answers from one indexed row and says only what the
-- login screen will print anyway.
-- ----------------------------------------------------------------------------
create or replace function public.salon_by_slug(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', s.id,
    'slug', s.slug,
    'name', s.name,
    'default_theme', s.default_theme,
    'suspended', s.suspended_at is not null
  )
  from public.salons s
  where s.slug = lower(trim(p_slug));
$$;

revoke all on function public.salon_by_slug(text) from public;
grant execute on function public.salon_by_slug(text) to anon, authenticated;


-- ▶▶▶ 20260728320000_provisioning.sql ▶▶▶

-- ============================================================================
-- Gated provisioning, impersonation, and the audit trail.
--
-- 1. Salon creation becomes platform-admin only, at every layer:
--      * bootstrap_salon (the old self-serve path) now refuses everyone but
--        the platform admin — the UI that called it is gone in the same
--        commit, but a deleted button is not security.
--      * the salons table gets an EXPLICIT insert policy: with check
--        (is_super_admin()). Before this the block was the *absence* of a
--        policy, which works but reads as an accident; now it is a rule.
--
-- 2. Impersonation lives in the database. Every RLS policy in the schema
--    already routes through current_salon_id(), so ONE branch in that
--    function makes support-view work everywhere — reads, writes, RPCs —
--    with no application-layer special cases to forget:
--
--      impersonations:  admin_id -> salon_id, one row per admin, RLS'd so
--                       only a platform admin can hold one.
--      current_salon_id: an active row wins over the admin's own salon.
--
-- 3. platform_audit_log records every provisioning and impersonation act:
--    who, what, which salon, when. Inserted by SECURITY DEFINER functions
--    only; readable by platform admins only.
--
-- Rollback: re-run 20260728010000_bootstrap_salon.sql for the old function;
-- drop policy "platform admin can create salons" on public.salons; drop
-- table public.impersonations, public.platform_audit_log; re-create
-- current_salon_id() as `select salon_id from profiles where id=auth.uid()`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Impersonation
-- ----------------------------------------------------------------------------
create table if not exists public.impersonations (
  admin_id   uuid primary key references public.profiles (id) on delete cascade,
  salon_id   uuid not null references public.salons (id) on delete cascade,
  started_at timestamptz not null default now()
);

alter table public.impersonations enable row level security;

drop policy if exists "platform admins manage their own impersonation" on public.impersonations;
create policy "platform admins manage their own impersonation"
  on public.impersonations for all
  using (admin_id = auth.uid() and public.is_super_admin())
  with check (admin_id = auth.uid() and public.is_super_admin());

grant select, insert, update, delete on public.impersonations to authenticated;

-- The one branch that makes impersonation real everywhere. The role check is
-- repeated here even though RLS already guards the table: this function is
-- the floor every policy stands on, and it does not get to trust anything.
create or replace function public.current_salon_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select i.salon_id
       from public.impersonations i
       join public.profiles p on p.id = i.admin_id
      where i.admin_id = auth.uid()
        and p.role = 'super_admin'),
    (select salon_id from public.profiles where id = auth.uid())
  );
$$;

-- ----------------------------------------------------------------------------
-- Audit
-- ----------------------------------------------------------------------------
create table if not exists public.platform_audit_log (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references public.profiles (id) on delete cascade,
  action     text not null,
  salon_id   uuid references public.salons (id) on delete set null,
  detail     jsonb,
  created_at timestamptz not null default now()
);

alter table public.platform_audit_log enable row level security;

drop policy if exists "platform admins read the audit log" on public.platform_audit_log;
create policy "platform admins read the audit log"
  on public.platform_audit_log for select
  using (public.is_super_admin());

-- Read-only from the API: rows arrive through the definer functions below.
grant select on public.platform_audit_log to authenticated;

create or replace function public.platform_audit(p_action text, p_salon uuid, p_detail jsonb default null)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.platform_audit_log (admin_id, action, salon_id, detail)
  values (auth.uid(), p_action, p_salon, p_detail);
$$;

revoke all on function public.platform_audit(text, uuid, jsonb) from public;
-- Internal: callable only by the definer functions below (they run as owner).

-- ----------------------------------------------------------------------------
-- Salon creation: explicit, admin-only, at the database
-- ----------------------------------------------------------------------------
drop policy if exists "platform admin can create salons" on public.salons;
create policy "platform admin can create salons"
  on public.salons for insert
  with check (public.is_super_admin());

-- The old self-serve door, closed. Kept as a function (the admin console and
-- seed script still want "make a salon and its first profile" in one place),
-- but it now refuses everyone below the platform.
create or replace function public.bootstrap_salon(p_salon_name text, p_full_name text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  raise exception 'Salons are created by the platform. Ask Zolvora to set one up.'
    using errcode = 'insufficient_privilege';
end;
$$;

-- ----------------------------------------------------------------------------
-- The admin console's verbs. Every one: guard first, act, audit.
-- ----------------------------------------------------------------------------
create or replace function public.admin_create_salon(p_name text, p_slug text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon public.salons;
begin
  if not public.is_super_admin() then
    raise exception 'Platform admin only' using errcode = 'insufficient_privilege';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'A salon name is required' using errcode = 'check_violation';
  end if;

  insert into public.salons (name, slug, default_theme)
  values (trim(p_name), nullif(trim(coalesce(p_slug, '')), ''), 'zolvora')
  returning * into v_salon;

  perform public.platform_audit('salon_created', v_salon.id,
    jsonb_build_object('name', v_salon.name, 'slug', v_salon.slug));

  return jsonb_build_object('id', v_salon.id, 'name', v_salon.name, 'slug', v_salon.slug);
end;
$$;

-- Attach a freshly invited auth user as the salon's first owner. The auth
-- user itself is created by the server with the service key (emailed invite,
-- never a password typed by the platform); this records who they are.
create or replace function public.admin_attach_owner(
  p_salon uuid,
  p_user  uuid,
  p_full_name text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Platform admin only' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.salons where id = p_salon) then
    raise exception 'No such salon' using errcode = 'no_data_found';
  end if;

  insert into public.profiles (id, salon_id, full_name, role)
  values (p_user, p_salon, coalesce(nullif(trim(p_full_name), ''), 'Owner'), 'manager')
  on conflict (id) do nothing;

  perform public.platform_audit('owner_attached', p_salon,
    jsonb_build_object('user_id', p_user));
end;
$$;

create or replace function public.admin_set_salon_suspended(p_salon uuid, p_suspended boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Platform admin only' using errcode = 'insufficient_privilege';
  end if;

  update public.salons
     set suspended_at = case when p_suspended then coalesce(suspended_at, now()) end
   where id = p_salon;
  if not found then
    raise exception 'No such salon' using errcode = 'no_data_found';
  end if;

  perform public.platform_audit(
    case when p_suspended then 'salon_suspended' else 'salon_reactivated' end, p_salon);
end;
$$;

create or replace function public.admin_impersonate(p_salon uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.is_super_admin() then
    raise exception 'Platform admin only' using errcode = 'insufficient_privilege';
  end if;

  select name into v_name from public.salons where id = p_salon;
  if v_name is null then
    raise exception 'No such salon' using errcode = 'no_data_found';
  end if;

  insert into public.impersonations (admin_id, salon_id)
  values (auth.uid(), p_salon)
  on conflict (admin_id) do update set salon_id = excluded.salon_id, started_at = now();

  perform public.platform_audit('impersonation_started', p_salon);
  return v_name;
end;
$$;

create or replace function public.admin_stop_impersonation()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon uuid;
begin
  delete from public.impersonations where admin_id = auth.uid()
  returning salon_id into v_salon;
  if v_salon is not null then
    perform public.platform_audit('impersonation_stopped', v_salon);
  end if;
end;
$$;

-- List with health: active staff and the last time anything happened.
create or replace function public.admin_list_salons()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.is_super_admin() then null else (
    select coalesce(jsonb_agg(row order by row -> 'created_at' desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'slug', s.slug,
        'created_at', s.created_at,
        'suspended_at', s.suspended_at,
        'staff', (select count(*) from public.profiles p
                   where p.salon_id = s.id and p.is_active and p.role <> 'kiosk'),
        'last_activity', greatest(
          (select max(j.created_at) from public.jobs j where j.salon_id = s.id),
          (select max(t.checked_in_at) from public.turn_checkins t where t.salon_id = s.id),
          (select max(y.created_at) from public.payments y where y.salon_id = s.id)
        )
      ) as row
      from public.salons s
    ) listed
  ) end;
$$;

do $$ begin
  grant execute on function
    public.admin_create_salon(text, text),
    public.admin_attach_owner(uuid, uuid, text),
    public.admin_set_salon_suspended(uuid, boolean),
    public.admin_impersonate(uuid),
    public.admin_stop_impersonation(),
    public.admin_list_salons()
  to authenticated;
end $$;


-- ▶▶▶ 20260728330000_branding.sql ▶▶▶

-- ============================================================================
-- Per-tenant branding: each salon controls its own look inside the shell.
--
--   logo_url     their mark, shown on their subdomain's login and kiosk.
--   brand_color  one hex. The app DERIVES an accessible accent from it per
--                mode (that math lives in src/lib/brand-color.ts and is
--                contrast-tested); the database stores what the owner picked,
--                not what the math corrected it to.
--   powered_by   the "Powered by Zolvora" mark, default true. Platform-only
--                to change — it is a future premium-tier flag, not a setting.
--
-- Storage: a public 'branding' bucket. Uploads are RLS'd to the salon's own
-- folder ({salon_id}/...) by its managers; reads are public, as a logo is.
--
-- Rollback: alter table public.salons drop column logo_url, drop column
-- brand_color, drop column powered_by; delete from storage.buckets where
-- id = 'branding'; drop the three storage.objects policies named below;
-- re-run 20260728310000_tenancy.sql for the previous salon_by_slug and
-- salons_guard_slug.
-- ============================================================================

alter table public.salons add column if not exists logo_url text;
alter table public.salons add column if not exists brand_color text;
alter table public.salons add column if not exists powered_by boolean not null default true;

do $$ begin
  alter table public.salons add constraint salons_brand_color_shape
    check (brand_color is null or brand_color ~ '^#[0-9a-f]{6}$');
exception when duplicate_object then null; end $$;

-- powered_by joins the platform-only columns in the update guard.
create or replace function public.salons_guard_slug()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.slug is distinct from old.slug and not public.is_super_admin() then
    raise exception 'Only the platform admin can change a salon''s address'
      using errcode = 'insufficient_privilege';
  end if;
  if new.custom_domain is distinct from old.custom_domain and not public.is_super_admin() then
    raise exception 'Only the platform admin can change a salon''s domain'
      using errcode = 'insufficient_privilege';
  end if;
  if new.suspended_at is distinct from old.suspended_at and not public.is_super_admin() then
    raise exception 'Only the platform admin can suspend or reactivate a salon'
      using errcode = 'insufficient_privilege';
  end if;
  if new.powered_by is distinct from old.powered_by and not public.is_super_admin() then
    raise exception 'The "powered by" mark is managed by the platform'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- The public lookup now carries the branding a login screen renders. Still
-- nothing money-shaped, still NULL for an unknown slug.
create or replace function public.salon_by_slug(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', s.id,
    'slug', s.slug,
    'name', s.name,
    'default_theme', s.default_theme,
    'suspended', s.suspended_at is not null,
    'logo_url', s.logo_url,
    'brand_color', s.brand_color,
    'powered_by', s.powered_by
  )
  from public.salons s
  where s.slug = lower(trim(p_slug));
$$;

-- ----------------------------------------------------------------------------
-- The logo bucket. Public read (a logo is public by definition); writes only
-- by the salon's own managers, only inside the salon's own folder.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

drop policy if exists "salon managers upload their branding" on storage.objects;
create policy "salon managers upload their branding"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'branding'
    and public.is_manager()
    and (storage.foldername(name))[1] = public.current_salon_id()::text
  );

drop policy if exists "salon managers replace their branding" on storage.objects;
create policy "salon managers replace their branding"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'branding'
    and public.is_manager()
    and (storage.foldername(name))[1] = public.current_salon_id()::text
  );

drop policy if exists "salon managers remove their branding" on storage.objects;
create policy "salon managers remove their branding"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'branding'
    and public.is_manager()
    and (storage.foldername(name))[1] = public.current_salon_id()::text
  );
