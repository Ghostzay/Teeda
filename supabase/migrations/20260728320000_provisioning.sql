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
