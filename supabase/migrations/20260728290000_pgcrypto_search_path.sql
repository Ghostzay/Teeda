-- ============================================================================
-- The kiosk PIN could not be saved. SQLSTATE 42883.
--
--   ERROR:  function gen_salt(unknown) does not exist
--
-- Not RLS, not the column, not validation. `set_kiosk_exit_pin` declares
--
--   SET search_path TO 'public'
--
-- and on Supabase `pgcrypto` is installed into the `extensions` schema, not
-- `public`. So `crypt()` and `gen_salt()` are simply not on the path inside the
-- function, and every PIN save failed the moment it tried to hash.
--
-- Why every test passed: the local harness these were developed against creates
-- pgcrypto with `create extension if not exists pgcrypto`, which lands it in
-- `public`. The functions worked there and nowhere else. Reproduced by moving
-- the extension to `extensions` and re-running the save — 42883, immediately.
--
-- The fix is the search_path, on all three functions that hash or compare:
-- setting the PIN, and the two that check it. `public, extensions` rather than
-- just `extensions`, because a project where pgcrypto really is in `public`
-- must keep working — including the local harness, so the tests keep testing
-- the same code that runs in production.
--
-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--   Re-run 20260728230000_kiosk.sql and 20260728280000_kiosk_mode.sql, which
--   contain the previous definitions. Nothing here changes a table, a column,
--   a policy or a row — only the search_path of three function bodies.
-- ============================================================================

-- Belt and braces: if the extension is missing entirely, create it where the
-- functions can see it. A no-op on Supabase, where it already exists.
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Set the salon's kiosk exit PIN.
--
-- Text, not an integer: "0042" is a valid PIN and an integer column would store
-- it as 42 and hand back "42" — a PIN that can never be entered correctly again.
-- It is bcrypt-hashed here and the plaintext is never stored, never returned,
-- and never leaves this function.
-- ----------------------------------------------------------------------------
create or replace function public.set_kiosk_exit_pin(p_pin text)
returns void
language plpgsql
volatile
security definer
-- The fix. `extensions` is where Supabase keeps pgcrypto.
set search_path = public, extensions
as $$
begin
  if not public.is_manager() then
    raise exception 'Only the owner can set the kiosk PIN'
      using errcode = 'insufficient_privilege';
  end if;

  -- 4 to 6 digits. Leading zeros are preserved because this is compared as
  -- text and hashed as text; nothing ever parses it as a number.
  if p_pin is null or p_pin !~ '^\d{4,6}$' then
    raise exception 'The PIN must be 4 to 6 digits' using errcode = 'check_violation';
  end if;

  update public.salons
     set kiosk_exit_pin_hash = crypt(p_pin, gen_salt('bf'))
   where id = public.current_salon_id();
end;
$$;

revoke all on function public.set_kiosk_exit_pin(text) from public;
grant execute on function public.set_kiosk_exit_pin(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Verify it. Same search_path fix; `crypt()` here had the same problem, so the
-- exit would have failed even for a PIN saved before this regression existed.
-- ----------------------------------------------------------------------------
create or replace function public.kiosk_verify_exit_pin(
  p_pin        text,
  p_device_key text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_salon  uuid := public.current_salon_id();
  v_hash   text;
  v_recent integer;
  v_key    text := coalesce(nullif(trim(p_device_key), ''), 'unknown');
  v_ok     boolean;
begin
  if v_salon is null then
    return jsonb_build_object('result', 'denied');
  end if;

  select count(*) into v_recent
  from public.kiosk_pin_attempts a
  where a.device_key = v_key
    and not a.succeeded
    and a.attempted_at > now() - interval '5 minutes';

  if v_recent >= 5 then
    return jsonb_build_object('result', 'locked_out');
  end if;

  select s.kiosk_exit_pin_hash into v_hash from public.salons s where s.id = v_salon;

  if v_hash is null then
    return jsonb_build_object('result', 'no_pin');
  end if;

  v_ok := crypt(p_pin, v_hash) = v_hash;

  insert into public.kiosk_pin_attempts (salon_id, device_key, succeeded)
  values (v_salon, v_key, v_ok);

  if v_ok then
    delete from public.kiosk_pin_attempts where device_key = v_key and not succeeded;
    return jsonb_build_object('result', 'ok');
  end if;

  return jsonb_build_object('result', 'wrong');
end;
$$;

revoke all on function public.kiosk_verify_exit_pin(text, text) from public;
grant execute on function public.kiosk_verify_exit_pin(text, text) to authenticated;

-- The original single-argument checker, kept working for the same reason.
create or replace function public.kiosk_check_exit_pin(p_pin text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_salon uuid := public.kiosk_salon_id();
  v_hash  text;
begin
  if v_salon is null then
    return false;
  end if;

  select kiosk_exit_pin_hash into v_hash from public.salons where id = v_salon;
  if v_hash is null then
    return false;
  end if;

  return crypt(p_pin, v_hash) = v_hash;
end;
$$;

revoke all on function public.kiosk_check_exit_pin(text) from public;
grant execute on function public.kiosk_check_exit_pin(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Does this salon have a PIN? A boolean, so the hash never leaves the server
-- to answer a question the UI only needs one bit for.
--
-- Exists so the ready screen can refuse to start kiosk mode without one:
-- shipping a kiosk with no exit is shipping a bricked tablet.
-- ----------------------------------------------------------------------------
create or replace function public.salon_has_exit_pin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.kiosk_exit_pin_hash is not null
       from public.salons s
      where s.id = coalesce(public.kiosk_salon_id(), public.current_salon_id())),
    false
  );
$$;

revoke all on function public.salon_has_exit_pin() from public;
grant execute on function public.salon_has_exit_pin() to authenticated;
