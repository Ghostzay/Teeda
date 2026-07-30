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
