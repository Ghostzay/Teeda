-- ============================================================================
-- A dashboard you can arrange.
--
-- Stored as jsonb rather than rows, and deliberately NOT constrained to a list
-- of known widget ids. The app owns the catalogue; the database stores a
-- preference. A CHECK constraint here would mean a migration every time a
-- widget is added or renamed, which is the same trap the theme registry avoids.
--
-- The read path in src/lib/dashboard.ts *merges* rather than replaces: a saved
-- layout supplies order and slot, anything the catalogue has gained since is
-- appended to its default slot, and anything the catalogue has lost is dropped.
-- Without that merge, shipping a new widget would silently hide it from
-- everyone who had ever customised their dashboard.
--
-- Resolution mirrors the theme: user layout → salon default → the built-in
-- recommended layout for that role.
-- ============================================================================

alter table public.profiles
  add column dashboard_layout jsonb;

comment on column public.profiles.dashboard_layout is
  'Per-user dashboard arrangement. NULL follows the salon default, then the '
  'built-in layout. Validated by the app against its widget catalogue, not by '
  'a database constraint.';

alter table public.salons
  add column default_dashboard_layout jsonb;

comment on column public.salons.default_dashboard_layout is
  'What a new manager or admin sees before they arrange their own.';

-- ----------------------------------------------------------------------------
-- Writes.
--
-- Techs are excluded on purpose: their screen is /tech, which is standardised,
-- and `requireFloorAccess` already sends them there. Rejecting the write too
-- means a stray call cannot leave a tech with a layout that nothing reads.
-- ----------------------------------------------------------------------------
create or replace function public.set_dashboard_layout(p_layout jsonb)
returns public.profiles
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  if not public.can_manage_floor() then
    raise exception 'The technician view is the same for everyone'
      using errcode = 'insufficient_privilege';
  end if;

  if p_layout is not null and jsonb_typeof(p_layout) <> 'object' then
    raise exception 'A layout must be an object' using errcode = 'check_violation';
  end if;

  update public.profiles
     set dashboard_layout = p_layout
   where id = auth.uid()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.set_dashboard_layout(jsonb) from public;
grant execute on function public.set_dashboard_layout(jsonb) to authenticated;

-- The owner sets what a new admin inherits.
create or replace function public.set_salon_dashboard_layout(p_layout jsonb)
returns public.salons
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.salons;
begin
  if not public.is_manager() then
    raise exception 'Only a manager can set the salon default'
      using errcode = 'insufficient_privilege';
  end if;

  if p_layout is not null and jsonb_typeof(p_layout) <> 'object' then
    raise exception 'A layout must be an object' using errcode = 'check_violation';
  end if;

  update public.salons
     set default_dashboard_layout = p_layout
   where id = public.current_salon_id()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.set_salon_dashboard_layout(jsonb) from public;
grant execute on function public.set_salon_dashboard_layout(jsonb) to authenticated;

-- ============================================================================
-- Today against the same weekday last week.
--
-- A running total says nothing on its own — $815 is a good Tuesday and a poor
-- Saturday. The comparison is the part that answers "is today going well?".
--
-- Same weekday rather than yesterday, because a salon's week has a shape:
-- Tuesday is never going to look like Saturday and comparing them would just
-- produce an alarming red arrow every Monday.
-- ============================================================================
create or replace function public.takings_comparison()
returns table (
  today_total     numeric,
  today_clients   integer,
  compared_total  numeric,
  compared_clients integer,
  compared_day    date
)
language sql
stable
security definer
set search_path = public
as $$
  with s as (select public.current_salon_id() as id),
       tz as (select coalesce(sa.timezone, 'UTC') as zone from public.salons sa, s where sa.id = s.id),
       bounds as (
         select
           public.salon_day_start() as today_from,
           public.salon_day_start() + interval '1 day' as today_to,
           -- Built from the local date, not by subtracting 168 hours, so a
           -- clock change does not shift the window by an hour.
           ((public.salon_today() - 7) at time zone tz.zone) as prev_from,
           ((public.salon_today() - 6) at time zone tz.zone) as prev_to,
           (public.salon_today() - 7) as prev_day
         from tz
       )
  select
    coalesce(sum(p.service_amount + p.tip_amount)
      filter (where p.created_at >= b.today_from and p.created_at < b.today_to), 0)::numeric,
    count(distinct p.job_id)
      filter (where p.created_at >= b.today_from and p.created_at < b.today_to)::int,
    coalesce(sum(p.service_amount + p.tip_amount)
      filter (where p.created_at >= b.prev_from and p.created_at < b.prev_to), 0)::numeric,
    count(distinct p.job_id)
      filter (where p.created_at >= b.prev_from and p.created_at < b.prev_to)::int,
    max(b.prev_day)
  from bounds b
  left join public.payments p
    on p.salon_id = (select id from s)
   and p.created_at >= b.prev_from
   and p.created_at <  b.today_to
  where public.can_manage_floor();
$$;

revoke all on function public.takings_comparison() from public;
grant execute on function public.takings_comparison() to authenticated;
