-- ============================================================================
-- Commission splits + earnings reporting.
--
-- The split is stored on every payment, not just derived from the salon's
-- current setting. Changing the house rate must never rewrite what someone
-- already earned.
-- ============================================================================

alter table public.salons
  add column tech_split_percent numeric(5, 2) not null default 60
    check (tech_split_percent >= 0 and tech_split_percent <= 100),
  -- Pay period as a length + anchor: covers weekly, fortnightly, monthly-ish
  -- without a rules engine.
  add column pay_period_days integer not null default 14 check (pay_period_days between 1 and 31),
  add column pay_period_anchor date not null default current_date;

alter table public.payments
  add column split_percent numeric(5, 2) not null default 60
    check (split_percent >= 0 and split_percent <= 100),
  add column tech_amount numeric(10, 2) not null default 0 check (tech_amount >= 0),
  add column salon_amount numeric(10, 2) not null default 0 check (salon_amount >= 0);

comment on column public.payments.tech_amount is
  'Tech take-home: their share of the service plus the whole tip.';
comment on column public.payments.salon_amount is
  'House share of the service. Tips are never split.';

-- Backfill anything recorded before splits existed, using the 60/40 default.
update public.payments
set tech_amount  = round(service_amount * 0.60, 2) + tip_amount,
    salon_amount = service_amount - round(service_amount * 0.60, 2)
where tech_amount = 0 and salon_amount = 0 and (service_amount > 0 or tip_amount > 0);

-- ----------------------------------------------------------------------------
-- Where the current pay period started.
-- ----------------------------------------------------------------------------
create or replace function public.pay_period_start(p_salon_id uuid default null)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select s.pay_period_anchor
       + (floor((current_date - s.pay_period_anchor)::numeric / s.pay_period_days)
          * s.pay_period_days)::int
  from public.salons s
  where s.id = coalesce(p_salon_id, public.current_salon_id());
$$;

revoke all on function public.pay_period_start(uuid) from public;
grant execute on function public.pay_period_start(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Record a payment: line items, split, and closing the job out.
--
-- `p_services` is a JSON array of {service_id, name, price, quantity}. When
-- supplied it replaces the job's line items and *defines* the service amount,
-- so the menu is the source of truth at checkout.
-- ----------------------------------------------------------------------------
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

  -- Line items win when given; they're what the desk actually rang up.
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

  select coalesce(p_split_percent, s.tech_split_percent) into v_split
  from public.salons s where s.id = v_job.salon_id;

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

revoke all on function public.record_payment(uuid, numeric, numeric, text, uuid, text, jsonb, numeric) from public;
grant execute on function public.record_payment(uuid, numeric, numeric, text, uuid, text, jsonb, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- Today's till, now split-aware.
-- ----------------------------------------------------------------------------
drop function if exists public.payment_totals_today();

create or replace function public.payment_totals_today()
returns table (
  service_total numeric,
  tip_total     numeric,
  tech_total    numeric,
  salon_total   numeric,
  payment_count integer,
  cash_total    numeric,
  card_total    numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(service_amount), 0)::numeric,
    coalesce(sum(tip_amount), 0)::numeric,
    coalesce(sum(tech_amount), 0)::numeric,
    coalesce(sum(salon_amount), 0)::numeric,
    count(*)::int,
    coalesce(sum(service_amount + tip_amount) filter (where method = 'cash'), 0)::numeric,
    coalesce(sum(service_amount + tip_amount) filter (where method = 'card'), 0)::numeric
  from public.payments
  where salon_id = public.current_salon_id()
    and public.can_manage_floor()
    and created_at >= date_trunc('day', now());
$$;

revoke all on function public.payment_totals_today() from public;
grant execute on function public.payment_totals_today() to authenticated;

-- ----------------------------------------------------------------------------
-- Earnings for one tech across the three windows the floor cares about.
-- A tech may only ask about themselves; the front desk may ask about anyone.
-- ----------------------------------------------------------------------------
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
    select 'today'::text  as scope, current_date as starts_on
    union all
    -- Week starts Monday; date_trunc gives the same answer every day of it.
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
    coalesce(
      max(p.split_percent),
      (select s.tech_split_percent from public.salons s
        join public.profiles pr on pr.salon_id = s.id where pr.id = v_tech)
    )::numeric
  from windows w
  left join public.payments p
    on p.tech_id = v_tech
   and p.created_at >= w.starts_on
  group by w.scope, w.starts_on;
end;
$$;

revoke all on function public.tech_earnings(uuid) from public;
grant execute on function public.tech_earnings(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Manager overview: every tech's performance over a window.
-- ----------------------------------------------------------------------------
create or replace function public.salon_earnings(p_scope text default 'today')
returns table (
  tech_id        uuid,
  full_name      text,
  services_count integer,
  service_total  numeric,
  tip_total      numeric,
  tech_total     numeric,
  salon_total    numeric
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
    and pr.role = 'tech'
  group by pr.id, pr.full_name
  order by coalesce(sum(p.tech_amount), 0) desc, pr.full_name;
end;
$$;

revoke all on function public.salon_earnings(text) from public;
grant execute on function public.salon_earnings(text) to authenticated;

-- Managers set the house split and pay period.
create or replace function public.update_salon_pay_settings(
  p_split_percent   numeric,
  p_pay_period_days integer default null,
  p_anchor          date default null
)
returns public.salons
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon public.salons;
begin
  if not public.is_manager() then
    raise exception 'Managers only' using errcode = 'insufficient_privilege';
  end if;

  if p_split_percent < 0 or p_split_percent > 100 then
    raise exception 'Split must be between 0 and 100' using errcode = 'check_violation';
  end if;

  update public.salons
  set tech_split_percent = p_split_percent,
      pay_period_days    = coalesce(p_pay_period_days, pay_period_days),
      pay_period_anchor  = coalesce(p_anchor, pay_period_anchor)
  where id = public.current_salon_id()
  returning * into v_salon;

  return v_salon;
end;
$$;

revoke all on function public.update_salon_pay_settings(numeric, integer, date) from public;
grant execute on function public.update_salon_pay_settings(numeric, integer, date) to authenticated;
