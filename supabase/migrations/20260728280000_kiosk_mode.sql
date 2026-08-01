-- ============================================================================
-- Kiosk mode: a session downgrade any role can enter, and a guarded way out.
--
-- Two things this adds, and one dead end it closes.
--
-- The dead end: the middleware sent a kiosk account to /kiosk — the locked
-- customer screen — the instant it signed in, so the lobby added last time was
-- unreachable. The exit hatch is disabled until a PIN exists, and there is no
-- way to set a PIN before first sign-in. A tablet signed in, locked, with no
-- exit. That part is fixed in the middleware, not here.
--
-- What is here:
--
--   * PIN attempts and lockout, counted server-side. A PIN pad that counts in
--     the browser is a PIN pad with no lockout, because the browser is the
--     thing being attacked.
--   * `kiosk_devices.entered_kiosk_mode_at` / `last_sign_in_at`, so the manager
--     list can say which tablets are actually locked right now.
--
-- The kiosk_mode flag itself is NOT stored here. It lives in a signed httpOnly
-- cookie so that middleware can read it without a database round trip on every
-- request — see `src/lib/kiosk-mode.ts`. What the database owns is the PIN that
-- clears it and the lockout that rate-limits guessing.
-- ============================================================================

alter table public.kiosk_devices
  add column if not exists last_sign_in_at        timestamptz,
  add column if not exists entered_kiosk_mode_at  timestamptz;

-- ----------------------------------------------------------------------------
-- Wrong-PIN attempts.
--
-- Keyed by device rather than by account: the lockout has to bite the tablet
-- somebody is holding, and a manager who starts kiosk mode on their own phone
-- gets their own bucket. `device_key` is the signed cookie's id, so clearing
-- cookies starts a fresh bucket — which is fine, because it also drops them out
-- of kiosk mode, which is the thing the PIN was protecting.
-- ----------------------------------------------------------------------------
create table if not exists public.kiosk_pin_attempts (
  id          bigserial primary key,
  salon_id    uuid not null references public.salons(id) on delete cascade,
  device_key  text not null,
  attempted_at timestamptz not null default now(),
  succeeded   boolean not null
);

create index if not exists kiosk_pin_attempts_recent_idx
  on public.kiosk_pin_attempts (device_key, attempted_at desc);

alter table public.kiosk_pin_attempts enable row level security;

create policy "managers can review pin attempts"
  on public.kiosk_pin_attempts for select
  to authenticated
  using (salon_id = public.current_salon_id() and public.is_manager());

grant select on public.kiosk_pin_attempts to authenticated;

-- ----------------------------------------------------------------------------
-- Check the exit PIN.
--
-- Replaces `kiosk_check_exit_pin`, which returned a bare boolean and shared the
-- lookup rate limiter. This one:
--
--   * works for ANY signed-in role, because a manager who started kiosk mode on
--     the front tablet needs the same way out as the tablet's own account;
--   * counts attempts per device, five then five minutes;
--   * never says how many attempts are left. "Wrong PIN" and "wrong PIN, two
--     to go" are different amounts of help to someone guessing.
-- ----------------------------------------------------------------------------
create or replace function public.kiosk_verify_exit_pin(
  p_pin        text,
  p_device_key text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
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

  -- Failures inside the window only. A success clears the slate below, so a
  -- day of ordinary use never accumulates toward a lockout.
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
    -- No PIN set. Refusing here would strand whoever is holding the tablet,
    -- and the screen that let them start kiosk mode warned them about exactly
    -- this — so it is a distinct answer the UI can explain, not a failure.
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

-- ----------------------------------------------------------------------------
-- Record that a device entered or left kiosk mode, for the manager list.
--
-- Only meaningful for a kiosk-role account: a manager who starts kiosk mode on
-- their own phone has no device row, and inventing one would put a phone in a
-- list of tablets. They are standing next to it and hold the PIN.
-- ----------------------------------------------------------------------------
create or replace function public.kiosk_mark_mode(p_entered boolean)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.kiosk_devices
     set entered_kiosk_mode_at = case when p_entered then now() else null end,
         last_sign_in_at = coalesce(last_sign_in_at, now())
   where id = auth.uid();
$$;

revoke all on function public.kiosk_mark_mode(boolean) from public;
grant execute on function public.kiosk_mark_mode(boolean) to authenticated;

/** Stamp a sign-in, so the manager list can show when a tablet was last used. */
create or replace function public.kiosk_touch_sign_in()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.kiosk_devices set last_sign_in_at = now() where id = auth.uid();
$$;

revoke all on function public.kiosk_touch_sign_in() from public;
grant execute on function public.kiosk_touch_sign_in() to authenticated;
