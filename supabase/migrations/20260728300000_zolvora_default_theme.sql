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
