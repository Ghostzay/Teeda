-- ============================================================================
-- Per-tech commission rates, the super-admin role, and alert dismissal.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Role helpers.
--
-- A super admin is the salon owner: everything a manager can do, plus the
-- exclusive right to create salons. `is_manager()` therefore has to include
-- them, or the owner would lock themselves out of their own settings.
-- ----------------------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active and role::text = 'super_admin'
  );
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_active
      and role::text in ('manager', 'super_admin')
  );
$$;

create or replace function public.can_manage_floor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_active
      and role::text in ('manager', 'admin', 'super_admin')
  );
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

-- The founding manager of each existing salon becomes its owner.
update public.profiles p
set role = 'super_admin'
where p.role::text = 'manager'
  and p.id = (
    select p2.id from public.profiles p2
    where p2.salon_id = p.salon_id and p2.role::text = 'manager'
    order by p2.created_at, p2.id
    limit 1
  );

-- ----------------------------------------------------------------------------
-- Per-tech commission.
--
-- A separate table rather than a column on `profiles`: RLS is row-level, so a
-- rate stored on the profile would be readable by everyone who can see the
-- roster. Here the manager sees every row and a tech sees only their own.
-- ----------------------------------------------------------------------------
create table public.tech_pay (
  tech_id            uuid primary key references public.profiles (id) on delete cascade,
  salon_id           uuid not null references public.salons (id) on delete cascade,
  -- NULL means "use the salon default", so a new hire needs no setup.
  commission_percent numeric(5, 2)
    check (commission_percent is null or (commission_percent >= 0 and commission_percent <= 100)),
  note               text,
  updated_by         uuid references public.profiles (id) on delete set null,
  updated_at         timestamptz not null default now()
);

create index tech_pay_salon_idx on public.tech_pay (salon_id);

create trigger tech_pay_touch_updated_at
  before update on public.tech_pay
  for each row execute function public.touch_updated_at();

alter table public.tech_pay enable row level security;

create policy "managers can view all commission rates"
  on public.tech_pay for select
  to authenticated
  using (salon_id = public.current_salon_id() and public.is_manager());

create policy "techs can view their own rate"
  on public.tech_pay for select
  to authenticated
  using (salon_id = public.current_salon_id() and tech_id = auth.uid());

create policy "managers can set commission rates"
  on public.tech_pay for insert
  to authenticated
  with check (salon_id = public.current_salon_id() and public.is_manager());

create policy "managers can change commission rates"
  on public.tech_pay for update
  to authenticated
  using (salon_id = public.current_salon_id() and public.is_manager())
  with check (salon_id = public.current_salon_id() and public.is_manager());

create policy "managers can clear commission rates"
  on public.tech_pay for delete
  to authenticated
  using (salon_id = public.current_salon_id() and public.is_manager());

grant select, insert, update, delete on public.tech_pay to authenticated;

/** The rate that actually applies to a tech: their own, else the house rate. */
create or replace function public.effective_commission(p_tech_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select tp.commission_percent from public.tech_pay tp where tp.tech_id = p_tech_id),
    (select s.tech_split_percent
       from public.salons s
       join public.profiles pr on pr.salon_id = s.id
      where pr.id = p_tech_id),
    60
  );
$$;

revoke all on function public.effective_commission(uuid) from public;
grant execute on function public.effective_commission(uuid) to authenticated;

create or replace function public.set_commission(
  p_tech_id uuid,
  p_percent numeric default null,
  p_note    text default null
)
returns public.tech_pay
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.tech_pay;
begin
  if not public.is_manager() then
    raise exception 'Managers only' using errcode = 'insufficient_privilege';
  end if;

  if p_percent is not null and (p_percent < 0 or p_percent > 100) then
    raise exception 'Commission must be between 0 and 100' using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_tech_id and salon_id = public.current_salon_id()
  ) then
    raise exception 'That tech is not on this salon''s roster' using errcode = 'no_data_found';
  end if;

  insert into public.tech_pay (tech_id, salon_id, commission_percent, note, updated_by)
  values (p_tech_id, public.current_salon_id(), p_percent, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (tech_id) do update
    set commission_percent = excluded.commission_percent,
        note               = excluded.note,
        updated_by         = excluded.updated_by
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.set_commission(uuid, numeric, text) from public;
grant execute on function public.set_commission(uuid, numeric, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Payments now split on the tech's own rate.
--
-- Drops the original 6-argument version first. Adding the line-items and
-- split parameters created a second overload rather than replacing the first,
-- which left calls that omit trailing arguments ambiguous.
-- ----------------------------------------------------------------------------
drop function if exists public.record_payment(uuid, numeric, numeric, text, uuid, text);

create or replace function public.record_payment(
  p_job_id         uuid,
  p_service_amount numeric default null,
  p_tip_amount     numeric default 0,
  p_method         text default 'cash',
  p_tech_id        uuid default null,
  p_note           text default null,
  p_services       jsonb default null,
  p_split_percent  numeric default null
)
returns public.payments
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_job       public.jobs;
  v_payment   public.payments;
  v_tech      uuid;
  v_service   numeric(10, 2);
  v_tip       numeric(10, 2) := round(coalesce(p_tip_amount, 0), 2);
  v_split     numeric(5, 2);
  v_tech_cut  numeric(10, 2);
begin
  if not public.can_manage_floor() then
    raise exception 'Only the front desk can record payments' using errcode = 'insufficient_privilege';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job not found' using errcode = 'no_data_found';
  end if;

  if v_job.salon_id is distinct from public.current_salon_id() then
    raise exception 'Not authorized for this salon' using errcode = 'insufficient_privilege';
  end if;

  if p_services is not null and jsonb_array_length(p_services) > 0 then
    delete from public.job_services where job_id = p_job_id;

    insert into public.job_services (salon_id, job_id, service_id, name, price, quantity)
    select
      v_job.salon_id,
      v_job.id,
      nullif(item ->> 'service_id', '')::uuid,
      coalesce(nullif(item ->> 'name', ''), 'Service'),
      round(coalesce((item ->> 'price')::numeric, 0), 2),
      greatest(coalesce((item ->> 'quantity')::int, 1), 1)
    from jsonb_array_elements(p_services) as item;

    select coalesce(sum(price * quantity), 0) into v_service
    from public.job_services where job_id = p_job_id;
  else
    select coalesce(
      p_service_amount,
      (select sum(price * quantity) from public.job_services where job_id = p_job_id),
      0
    ) into v_service;
  end if;

  v_service := round(coalesce(v_service, 0), 2);

  if v_service < 0 or v_tip < 0 then
    raise exception 'Amounts cannot be negative' using errcode = 'check_violation';
  end if;

  v_tech := coalesce(p_tech_id, v_job.tech_id);

  if v_tech is not null and not exists (
    select 1 from public.profiles where id = v_tech and salon_id = v_job.salon_id
  ) then
    raise exception 'That tech is not on this salon''s roster' using errcode = 'check_violation';
  end if;

  -- Explicit override wins; otherwise this tech's own rate, then the house rate.
  v_split := coalesce(
    p_split_percent,
    case when v_tech is not null then public.effective_commission(v_tech) end,
    (select s.tech_split_percent from public.salons s where s.id = v_job.salon_id)
  );

  if v_split < 0 or v_split > 100 then
    raise exception 'Split must be between 0 and 100' using errcode = 'check_violation';
  end if;

  -- Tips are never split; the house takes a share of the service only.
  v_tech_cut := round(v_service * v_split / 100, 2);

  if v_job.status in ('waiting', 'in_progress') then
    update public.jobs
    set status = 'completed',
        completed_at = now(),
        started_at = coalesce(started_at, now())
    where id = p_job_id
    returning * into v_job;

    if v_job.appointment_id is not null then
      update public.appointments set status = 'completed' where id = v_job.appointment_id;
    end if;
  end if;

  insert into public.payments (
    salon_id, job_id, tech_id, service_amount, tip_amount, method, note, recorded_by,
    split_percent, tech_amount, salon_amount
  )
  values (
    v_job.salon_id, v_job.id, v_tech, v_service, v_tip,
    coalesce(nullif(p_method, ''), 'cash')::public.payment_method,
    nullif(trim(coalesce(p_note, '')), ''),
    auth.uid(),
    v_split, v_tech_cut + v_tip, v_service - v_tech_cut
  )
  on conflict (job_id) do update
    set tech_id        = excluded.tech_id,
        service_amount = excluded.service_amount,
        tip_amount     = excluded.tip_amount,
        method         = excluded.method,
        note           = excluded.note,
        recorded_by    = excluded.recorded_by,
        split_percent  = excluded.split_percent,
        tech_amount    = excluded.tech_amount,
        salon_amount   = excluded.salon_amount
  returning * into v_payment;

  return v_payment;
end;
$$;

grant execute on function public.record_payment(uuid, numeric, numeric, text, uuid, text, jsonb, numeric) to authenticated;

-- Earnings report the tech's own rate, not the house default.
create or replace function public.tech_earnings(p_tech_id uuid default null)
returns table (
  scope          text,
  period_start   date,
  services_count integer,
  service_total  numeric,
  tip_total      numeric,
  tech_total     numeric,
  split_percent  numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tech uuid := coalesce(p_tech_id, auth.uid());
begin
  if v_tech <> auth.uid() and not public.can_manage_floor() then
    raise exception 'You can only view your own earnings' using errcode = 'insufficient_privilege';
  end if;

  return query
  with windows as (
    select 'today'::text as scope, current_date as starts_on
    union all
    select 'week',   (date_trunc('week', current_date))::date
    union all
    select 'period', public.pay_period_start((select salon_id from public.profiles where id = v_tech))
  )
  select
    w.scope,
    w.starts_on,
    count(p.*)::int,
    coalesce(sum(p.service_amount), 0)::numeric,
    coalesce(sum(p.tip_amount), 0)::numeric,
    coalesce(sum(p.tech_amount), 0)::numeric,
    public.effective_commission(v_tech)
  from windows w
  left join public.payments p
    on p.tech_id = v_tech
   and p.created_at >= w.starts_on
  group by w.scope, w.starts_on;
end;
$$;

grant execute on function public.tech_earnings(uuid) to authenticated;

-- Manager overview carries each tech's rate.
drop function if exists public.salon_earnings(text);

create or replace function public.salon_earnings(p_scope text default 'today')
returns table (
  tech_id            uuid,
  full_name          text,
  commission_percent numeric,
  services_count     integer,
  service_total      numeric,
  tip_total          numeric,
  tech_total         numeric,
  salon_total        numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start date;
begin
  if not public.can_manage_floor() then
    raise exception 'Front desk only' using errcode = 'insufficient_privilege';
  end if;

  v_start := case lower(coalesce(p_scope, 'today'))
    when 'week'   then (date_trunc('week', current_date))::date
    when 'period' then public.pay_period_start()
    else current_date
  end;

  return query
  select
    pr.id,
    pr.full_name,
    public.effective_commission(pr.id),
    count(p.*)::int,
    coalesce(sum(p.service_amount), 0)::numeric,
    coalesce(sum(p.tip_amount), 0)::numeric,
    coalesce(sum(p.tech_amount), 0)::numeric,
    coalesce(sum(p.salon_amount), 0)::numeric
  from public.profiles pr
  left join public.payments p
    on p.tech_id = pr.id
   and p.created_at >= v_start
  where pr.salon_id = public.current_salon_id()
    and pr.role::text = 'tech'
  group by pr.id, pr.full_name
  order by coalesce(sum(p.tech_amount), 0) desc, pr.full_name;
end;
$$;

grant execute on function public.salon_earnings(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Only a super admin creates salons.
--
-- Creates the salon and its first manager login in one step, so the owner can
-- hand a new location over without ever entering it themselves.
-- ----------------------------------------------------------------------------
create or replace function public.create_salon_as_owner(p_name text)
returns public.salons
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon public.salons;
begin
  if not public.is_super_admin() then
    raise exception 'Only the salon owner can create new salons' using errcode = 'insufficient_privilege';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'A salon name is required' using errcode = 'check_violation';
  end if;

  insert into public.salons (name) values (trim(p_name)) returning * into v_salon;
  return v_salon;
end;
$$;

revoke all on function public.create_salon_as_owner(text) from public;
grant execute on function public.create_salon_as_owner(text) to authenticated;

-- Signing up creates the salon *and* makes that person its owner.
create or replace function public.bootstrap_salon(
  p_salon_name text,
  p_full_name  text default null
)
returns uuid
language plpgsql
volatile
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

  insert into public.salons (name) values (trim(p_salon_name)) returning id into v_salon_id;

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

grant execute on function public.bootstrap_salon(text, text) to authenticated;

-- New sign-ups through the auth trigger become owners too.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta          jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_salon_id    uuid;
  v_full_name   text := nullif(trim(coalesce(meta ->> 'full_name', '')), '');
  v_salon_name  text := nullif(trim(coalesce(meta ->> 'salon_name', '')), '');
  v_role        public.user_role;
begin
  if meta ->> 'salon_id' is not null then
    v_salon_id := (meta ->> 'salon_id')::uuid;
    v_role := coalesce(nullif(meta ->> 'role', '')::public.user_role, 'tech');
  elsif v_salon_name is not null then
    insert into public.salons (name) values (v_salon_name) returning id into v_salon_id;
    v_role := 'super_admin';
  else
    return new;
  end if;

  insert into public.profiles (id, salon_id, full_name, role)
  values (new.id, v_salon_id, coalesce(v_full_name, split_part(new.email, '@', 1)), v_role)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Alerts: dismissing one, or clearing the lot.
-- ----------------------------------------------------------------------------
create or replace function public.dismiss_notification(p_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.notifications where id = p_id and user_id = auth.uid();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.clear_notifications()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.notifications where user_id = auth.uid();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.dismiss_notification(uuid) from public;
revoke all on function public.clear_notifications() from public;
grant execute on function public.dismiss_notification(uuid) to authenticated;
grant execute on function public.clear_notifications() to authenticated;
