-- ============================================================================
-- Payment tracking.
--
-- Records what was collected for a finished job and who the tip belongs to.
-- Deliberately not a payments *integration*: nothing here moves money, it
-- only records what the front desk took at the counter.
-- ============================================================================

create type public.payment_method as enum ('cash', 'card', 'other');

create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  salon_id        uuid not null references public.salons (id) on delete cascade,
  job_id          uuid not null references public.jobs (id) on delete cascade,
  -- Who the tip belongs to. Normally the job's tech, but the desk can direct
  -- it elsewhere (someone covered the fill, a shared set, etc.).
  tech_id         uuid references public.profiles (id) on delete set null,
  service_amount  numeric(10, 2) not null default 0 check (service_amount >= 0),
  tip_amount      numeric(10, 2) not null default 0 check (tip_amount >= 0),
  method          public.payment_method not null default 'cash',
  note            text,
  recorded_by     uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One payment record per job; re-recording corrects the existing row.
create unique index payments_job_id_idx on public.payments (job_id);
create index payments_salon_created_idx on public.payments (salon_id, created_at desc);
create index payments_tech_created_idx on public.payments (tech_id, created_at desc) where tech_id is not null;

create trigger payments_touch_updated_at
  before update on public.payments
  for each row execute function public.touch_updated_at();

alter table public.payments enable row level security;

-- The desk sees the whole till; a tech sees only rows where the tip is theirs.
create policy "front desk can view salon payments"
  on public.payments for select
  to authenticated
  using (salon_id = public.current_salon_id() and public.can_manage_floor());

create policy "techs can view their own tips"
  on public.payments for select
  to authenticated
  using (salon_id = public.current_salon_id() and tech_id = auth.uid());

create policy "front desk can record payments"
  on public.payments for insert
  to authenticated
  with check (salon_id = public.current_salon_id() and public.can_manage_floor());

create policy "front desk can correct payments"
  on public.payments for update
  to authenticated
  using (salon_id = public.current_salon_id() and public.can_manage_floor())
  with check (salon_id = public.current_salon_id() and public.can_manage_floor());

create policy "managers can delete payments"
  on public.payments for delete
  to authenticated
  using (salon_id = public.current_salon_id() and public.is_manager());

grant select, insert, update, delete on public.payments to authenticated;

alter publication supabase_realtime add table public.payments;

-- ----------------------------------------------------------------------------
-- Record a payment and close the job out in one step.
--
-- The desk finishes a client and takes payment in the same motion, so this
-- completes the job too rather than making them press two buttons in order.
-- ----------------------------------------------------------------------------
create or replace function public.record_payment(
  p_job_id         uuid,
  p_service_amount numeric,
  p_tip_amount     numeric default 0,
  p_method         text default 'cash',
  p_tech_id        uuid default null,
  p_note           text default null
)
returns public.payments
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_job     public.jobs;
  v_payment public.payments;
  v_tech    uuid;
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

  if coalesce(p_service_amount, 0) < 0 or coalesce(p_tip_amount, 0) < 0 then
    raise exception 'Amounts cannot be negative' using errcode = 'check_violation';
  end if;

  -- Tip goes to the job's tech unless the desk names someone else.
  v_tech := coalesce(p_tech_id, v_job.tech_id);

  if v_tech is not null and not exists (
    select 1 from public.profiles where id = v_tech and salon_id = v_job.salon_id
  ) then
    raise exception 'That tech is not on this salon''s roster' using errcode = 'check_violation';
  end if;

  -- Taking payment finishes the client.
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
    salon_id, job_id, tech_id, service_amount, tip_amount, method, note, recorded_by
  )
  values (
    v_job.salon_id,
    v_job.id,
    v_tech,
    coalesce(p_service_amount, 0),
    coalesce(p_tip_amount, 0),
    coalesce(nullif(p_method, ''), 'cash')::public.payment_method,
    nullif(trim(coalesce(p_note, '')), ''),
    auth.uid()
  )
  on conflict (job_id) do update
    set tech_id        = excluded.tech_id,
        service_amount = excluded.service_amount,
        tip_amount     = excluded.tip_amount,
        method         = excluded.method,
        note           = excluded.note,
        recorded_by    = excluded.recorded_by
  returning * into v_payment;

  return v_payment;
end;
$$;

revoke all on function public.record_payment(uuid, numeric, numeric, text, uuid, text) from public;
grant execute on function public.record_payment(uuid, numeric, numeric, text, uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Today's till, for the manager dashboard.
-- ----------------------------------------------------------------------------
create or replace function public.payment_totals_today()
returns table (
  service_total numeric,
  tip_total     numeric,
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

-- Tips a tech has earned today — the only money figure a tech can see.
create or replace function public.my_tips_today()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(tip_amount), 0)::numeric
  from public.payments
  where tech_id = auth.uid()
    and salon_id = public.current_salon_id()
    and created_at >= date_trunc('day', now());
$$;

revoke all on function public.my_tips_today() from public;
grant execute on function public.my_tips_today() to authenticated;
