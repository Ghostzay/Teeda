-- ============================================================================
-- Three roles, clearly separated:
--
--   manager  full access, including salon settings and the team roster
--   admin    runs the floor — checks clients in, creates jobs, manages the
--            queue — but cannot touch settings or the team
--   tech     their own work only
--
-- `is_manager()` keeps its narrow meaning (settings + roster). Floor work is
-- gated by the new `can_manage_floor()`.
--
-- Role comparisons cast to text rather than using enum literals, so this file
-- is safe even if it is run in the same transaction as the ALTER TYPE.
-- ============================================================================

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
      and role::text in ('manager', 'admin')
  );
$$;

revoke all on function public.can_manage_floor() from public;
grant execute on function public.can_manage_floor() to authenticated;

-- ----------------------------------------------------------------------------
-- Pass on a turn.
--
-- A tech may decline the client they've been handed. Declining costs them
-- their place — `last_turn_at` moves to now — and the client is offered to
-- whoever is next, so nobody can farm the queue by skipping work they dislike.
-- ----------------------------------------------------------------------------
create or replace function public.skip_job(p_job_id uuid)
returns public.jobs
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_job  public.jobs;
  v_next uuid;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job not found' using errcode = 'no_data_found';
  end if;

  if v_job.salon_id is distinct from public.current_salon_id() then
    raise exception 'Not authorized for this salon' using errcode = 'insufficient_privilege';
  end if;

  if not public.can_manage_floor() and v_job.tech_id is distinct from auth.uid() then
    raise exception 'You can only pass on your own client' using errcode = 'insufficient_privilege';
  end if;

  if v_job.status <> 'waiting' then
    raise exception 'Only a waiting client can be passed on' using errcode = 'check_violation';
  end if;

  if v_job.tech_id is not null then
    update public.profiles set last_turn_at = now() where id = v_job.tech_id;
  end if;

  -- Offer it to the next tech in rotation; never straight back to the skipper.
  v_next := public.suggest_next_tech(v_job.salon_id);
  if v_next is not distinct from v_job.tech_id then
    v_next := null;
  end if;

  update public.jobs set tech_id = v_next where id = p_job_id returning * into v_job;
  return v_job;
end;
$$;

revoke all on function public.skip_job(uuid) from public;
grant execute on function public.skip_job(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Floor work is now open to admins as well as managers.
-- ----------------------------------------------------------------------------
create or replace function public.assign_job(p_job_id uuid, p_tech_id uuid)
returns public.jobs
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_job public.jobs;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job not found' using errcode = 'no_data_found';
  end if;

  if v_job.salon_id is distinct from public.current_salon_id() then
    raise exception 'Not authorized for this salon' using errcode = 'insufficient_privilege';
  end if;

  if not public.can_manage_floor()
     and not (v_job.tech_id is null and p_tech_id = auth.uid() and v_job.status = 'waiting')
  then
    raise exception 'Only the front desk can assign this client' using errcode = 'insufficient_privilege';
  end if;

  if p_tech_id is not null and not exists (
    select 1 from public.profiles
    where id = p_tech_id and salon_id = v_job.salon_id and is_active
  ) then
    raise exception 'That tech is not on this salon''s active roster' using errcode = 'check_violation';
  end if;

  update public.jobs set tech_id = p_tech_id where id = p_job_id returning * into v_job;
  return v_job;
end;
$$;

create or replace function public.start_job(p_job_id uuid, p_tech_id uuid default null)
returns public.jobs
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_job  public.jobs;
  v_tech uuid;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job not found' using errcode = 'no_data_found';
  end if;

  if v_job.salon_id is distinct from public.current_salon_id() then
    raise exception 'Not authorized for this salon' using errcode = 'insufficient_privilege';
  end if;

  v_tech := coalesce(p_tech_id, v_job.tech_id, auth.uid());

  if not public.can_manage_floor() and v_tech is distinct from auth.uid() then
    raise exception 'Only the front desk can start a job for another tech' using errcode = 'insufficient_privilege';
  end if;

  if v_job.status <> 'waiting' then
    raise exception 'This client is already %', v_job.status using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.jobs
    where tech_id = v_tech and status = 'in_progress' and id <> p_job_id
  ) then
    raise exception 'That tech already has a client in progress' using errcode = 'unique_violation';
  end if;

  update public.jobs
  set tech_id = v_tech, status = 'in_progress', started_at = now()
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

create or replace function public.complete_job(p_job_id uuid)
returns public.jobs
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_job public.jobs;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job not found' using errcode = 'no_data_found';
  end if;

  if v_job.salon_id is distinct from public.current_salon_id() then
    raise exception 'Not authorized for this salon' using errcode = 'insufficient_privilege';
  end if;

  if not public.can_manage_floor() and v_job.tech_id is distinct from auth.uid() then
    raise exception 'Only the front desk can finish another tech''s job' using errcode = 'insufficient_privilege';
  end if;

  if v_job.status not in ('waiting', 'in_progress') then
    raise exception 'This client is already %', v_job.status using errcode = 'check_violation';
  end if;

  update public.jobs
  set status = 'completed',
      completed_at = now(),
      started_at = coalesce(started_at, now())
  where id = p_job_id
  returning * into v_job;

  if v_job.appointment_id is not null then
    update public.appointments set status = 'completed' where id = v_job.appointment_id;
  end if;

  return v_job;
end;
$$;

-- Queue management is floor work; the roster is not.
create or replace function public.reset_turn(p_tech_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.can_manage_floor() then
    raise exception 'Front desk only' using errcode = 'insufficient_privilege';
  end if;

  update public.profiles
  set last_turn_at = now()
  where id = p_tech_id and salon_id = public.current_salon_id();
end;
$$;

-- ----------------------------------------------------------------------------
-- RLS: swap is_manager() for can_manage_floor() on everything the front desk
-- touches. Settings and the roster keep the narrower is_manager() check.
-- ----------------------------------------------------------------------------

-- jobs -----------------------------------------------------------------------
drop policy if exists "managers can view all salon jobs" on public.jobs;
create policy "front desk can view all salon jobs"
  on public.jobs for select
  to authenticated
  using (salon_id = public.current_salon_id() and public.can_manage_floor());

drop policy if exists "managers can update any salon job" on public.jobs;
create policy "front desk can update any salon job"
  on public.jobs for update
  to authenticated
  using (salon_id = public.current_salon_id() and public.can_manage_floor())
  with check (salon_id = public.current_salon_id());

drop policy if exists "managers can delete jobs" on public.jobs;
create policy "front desk can delete jobs"
  on public.jobs for delete
  to authenticated
  using (salon_id = public.current_salon_id() and public.can_manage_floor());

-- Techs no longer create jobs: check-in is a front-desk action.
drop policy if exists "salon members can create jobs" on public.jobs;
create policy "front desk can create jobs"
  on public.jobs for insert
  to authenticated
  with check (salon_id = public.current_salon_id() and public.can_manage_floor());

-- customers ------------------------------------------------------------------
-- Techs read client notes to serve them, but never create or edit records.
drop policy if exists "salon members can add customers" on public.customers;
create policy "front desk can add customers"
  on public.customers for insert
  to authenticated
  with check (salon_id = public.current_salon_id() and public.can_manage_floor());

drop policy if exists "managers can update customers" on public.customers;
create policy "front desk can update customers"
  on public.customers for update
  to authenticated
  using (salon_id = public.current_salon_id() and public.can_manage_floor())
  with check (salon_id = public.current_salon_id() and public.can_manage_floor());

-- Deleting a client takes their history with it — managers only.
drop policy if exists "managers can delete customers" on public.customers;
create policy "managers can delete customers"
  on public.customers for delete
  to authenticated
  using (salon_id = public.current_salon_id() and public.is_manager());

-- appointments ---------------------------------------------------------------
drop policy if exists "managers can view all salon appointments" on public.appointments;
create policy "front desk can view all salon appointments"
  on public.appointments for select
  to authenticated
  using (salon_id = public.current_salon_id() and public.can_manage_floor());

drop policy if exists "managers can create appointments" on public.appointments;
create policy "front desk can create appointments"
  on public.appointments for insert
  to authenticated
  with check (salon_id = public.current_salon_id() and public.can_manage_floor());

drop policy if exists "managers can update appointments" on public.appointments;
create policy "front desk can update appointments"
  on public.appointments for update
  to authenticated
  using (salon_id = public.current_salon_id() and public.can_manage_floor())
  with check (salon_id = public.current_salon_id() and public.can_manage_floor());

drop policy if exists "managers can delete appointments" on public.appointments;
create policy "front desk can delete appointments"
  on public.appointments for delete
  to authenticated
  using (salon_id = public.current_salon_id() and public.can_manage_floor());

-- storage --------------------------------------------------------------------
drop policy if exists "salon members can upload job photos" on storage.objects;
create policy "front desk can upload job photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = public.current_salon_id()::text
    and public.can_manage_floor()
  );
