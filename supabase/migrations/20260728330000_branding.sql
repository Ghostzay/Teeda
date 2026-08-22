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
