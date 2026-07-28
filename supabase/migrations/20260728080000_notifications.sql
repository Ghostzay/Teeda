-- ============================================================================
-- In-app notifications.
--
-- Written by database triggers rather than the app, so a tech is told about a
-- booking however it was made — front desk, RPC, or SQL console.
-- ============================================================================

create type public.notification_type as enum (
  'appointment_assigned',
  'appointment_changed',
  'appointment_cancelled',
  'job_assigned'
);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references public.salons (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        public.notification_type not null,
  title       text not null,
  body        text,
  link        text,
  -- What it's about, so the UI can deep-link without a second lookup.
  appointment_id uuid references public.appointments (id) on delete cascade,
  job_id         uuid references public.jobs (id) on delete cascade,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

-- Notifications are personal: you only ever see your own.
create policy "users read their own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy "users mark their own notifications read"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users can clear their own notifications"
  on public.notifications for delete
  to authenticated
  using (user_id = auth.uid());

grant select, update, delete on public.notifications to authenticated;

alter publication supabase_realtime add table public.notifications;

-- ----------------------------------------------------------------------------
-- Tell a tech when an appointment lands on them, moves, or is cancelled.
-- ----------------------------------------------------------------------------
create or replace function public.notify_appointment_tech()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client text;
  v_when   text;
begin
  select c.name into v_client from public.customers c where c.id = new.customer_id;
  v_when := to_char(new.scheduled_at, 'Dy DD Mon at HH12:MI AM');

  if tg_op = 'INSERT' then
    if new.tech_id is not null then
      insert into public.notifications (salon_id, user_id, type, title, body, link, appointment_id)
      values (
        new.salon_id, new.tech_id, 'appointment_assigned',
        'New appointment booked with you',
        coalesce(v_client, 'A client') || ' · ' || new.service_name || ' · ' || v_when,
        '/tech', new.id
      );
    end if;
    return new;
  end if;

  -- Reassigned: the new tech gets it, the old one is told it's gone.
  if new.tech_id is distinct from old.tech_id then
    if new.tech_id is not null then
      insert into public.notifications (salon_id, user_id, type, title, body, link, appointment_id)
      values (
        new.salon_id, new.tech_id, 'appointment_assigned',
        'An appointment was assigned to you',
        coalesce(v_client, 'A client') || ' · ' || new.service_name || ' · ' || v_when,
        '/tech', new.id
      );
    end if;

    if old.tech_id is not null then
      insert into public.notifications (salon_id, user_id, type, title, body, link, appointment_id)
      values (
        new.salon_id, old.tech_id, 'appointment_changed',
        'An appointment moved off your book',
        coalesce(v_client, 'A client') || ' · ' || v_when,
        '/tech', new.id
      );
    end if;

    return new;
  end if;

  if new.tech_id is not null and new.scheduled_at is distinct from old.scheduled_at then
    insert into public.notifications (salon_id, user_id, type, title, body, link, appointment_id)
    values (
      new.salon_id, new.tech_id, 'appointment_changed',
      'An appointment was rescheduled',
      coalesce(v_client, 'A client') || ' · now ' || v_when,
      '/tech', new.id
    );
  end if;

  if new.tech_id is not null and new.status = 'cancelled' and old.status <> 'cancelled' then
    insert into public.notifications (salon_id, user_id, type, title, body, link, appointment_id)
    values (
      new.salon_id, new.tech_id, 'appointment_cancelled',
      'An appointment was cancelled',
      coalesce(v_client, 'A client') || ' · ' || v_when,
      '/tech', new.id
    );
  end if;

  return new;
end;
$$;

create trigger appointments_notify_tech
  after insert or update on public.appointments
  for each row execute function public.notify_appointment_tech();

-- ----------------------------------------------------------------------------
-- Tell a tech when a client is put in front of them right now.
-- ----------------------------------------------------------------------------
create or replace function public.notify_job_tech()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client text;
begin
  if new.tech_id is null or new.status <> 'waiting' then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.tech_id is not distinct from old.tech_id then
    return new;
  end if;

  select c.name into v_client from public.customers c where c.id = new.customer_id;

  insert into public.notifications (salon_id, user_id, type, title, body, link, job_id)
  values (
    new.salon_id, new.tech_id, 'job_assigned',
    'A client is waiting for you',
    coalesce(v_client, 'A client') || ' · ' || new.service_name,
    '/tech', new.id
  );

  return new;
end;
$$;

create trigger jobs_notify_tech
  after insert or update on public.jobs
  for each row execute function public.notify_job_tech();

-- ----------------------------------------------------------------------------
-- Mark read.
-- ----------------------------------------------------------------------------
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null
    and (p_ids is null or id = any (p_ids));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_notifications_read(uuid[]) from public;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
