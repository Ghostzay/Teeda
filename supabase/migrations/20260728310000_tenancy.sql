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
