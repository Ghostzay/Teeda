-- ============================================================================
-- Application-level salon bootstrap.
--
-- The `on_auth_user_created` trigger is a fast path, not a dependency:
-- creating a trigger on `auth.users` needs elevated privileges and can fail
-- (silently rolling back a whole migration) depending on how the SQL is run.
-- This function lets the app create the salon itself, so onboarding works
-- whether or not that trigger exists.
-- ============================================================================

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

  -- Idempotent: if a salon already exists for this user (trigger got there
  -- first, or a double submit), hand back the one they have.
  select salon_id into v_existing from public.profiles where id = v_uid;
  if v_existing is not null then
    return v_existing;
  end if;

  if nullif(trim(coalesce(p_salon_name, '')), '') is null then
    raise exception 'A salon name is required.' using errcode = 'check_violation';
  end if;

  select email into v_email from auth.users where id = v_uid;

  insert into public.salons (name)
  values (trim(p_salon_name))
  returning id into v_salon_id;

  insert into public.profiles (id, salon_id, full_name, role)
  values (
    v_uid,
    v_salon_id,
    coalesce(
      nullif(trim(coalesce(p_full_name, '')), ''),
      nullif(split_part(coalesce(v_email, ''), '@', 1), ''),
      'Manager'
    ),
    'manager'
  );

  return v_salon_id;
end;
$$;

revoke all on function public.bootstrap_salon(text, text) from public;
grant execute on function public.bootstrap_salon(text, text) to authenticated;

-- Table privileges. Supabase's default privileges normally cover this, but
-- they can be missing if the `public` schema was recreated — and without them
-- every query fails with "permission denied for table" before RLS is even
-- consulted. RLS still decides which rows are visible.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on
  public.salons, public.profiles, public.customers, public.jobs, public.appointments
  to authenticated;

-- Re-attach the auth trigger if this role is allowed to. A failure here is not
-- fatal any more — it just means signup takes the bootstrap path instead.
do $$
begin
  begin
    drop trigger if exists on_auth_user_created on auth.users;
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  exception
    when others then
      raise notice
        'Could not attach the auth.users trigger (%). This is fine — the app calls public.bootstrap_salon() instead.',
        sqlerrm;
  end;
end;
$$;
