-- ============================================================================
-- A kiosk is an account you log into, not a device you provision.
--
-- The hole this closes: `ROLE_LABEL` gained "Kiosk device", so the Staff page's
-- role dropdown offered it — but only `register_kiosk_device()` created the
-- `kiosk_devices` row, and the Staff form never called it. Picking Kiosk there
-- produced an account that:
--
--   * had a profile with role = 'kiosk'          (so it could sign in)
--   * was locked to /kiosk by the middleware     (so it could go nowhere else)
--   * had no kiosk_devices row                   (so kiosk_salon_id() was NULL)
--   * and every screen answered "This device is not set up"
--
-- Reproduced before writing this: is_kiosk() true, kiosk_salon_id() null,
-- kiosk_lookup_client() raising insufficient_privilege. A dead tablet.
--
-- The fix is a trigger rather than another call site. Two ways to make a kiosk
-- means one of them will be forgotten again — and the next one will not be the
-- Staff form, it will be somebody changing a role in the database by hand.
-- ============================================================================

create or replace function public.sync_kiosk_device()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role::text = 'kiosk' then
    -- The profile's name is the device's label. On the Staff form that field
    -- is "Full name", which for a tablet is where somebody types "Front desk
    -- iPad" — so the two are the same thing and should not be asked twice.
    insert into public.kiosk_devices (id, salon_id, label, created_by)
    values (new.id, new.salon_id, coalesce(nullif(trim(new.full_name), ''), 'Kiosk'), auth.uid())
    on conflict (id) do update
      set salon_id  = excluded.salon_id,
          label     = excluded.label,
          -- Re-selecting the Kiosk role for an account that was switched off
          -- is a deliberate act; treat it as switching the device back on.
          is_active = true;

  elsif tg_op = 'UPDATE' and old.role::text = 'kiosk' then
    -- Demoted out of the kiosk role. The device row stops being meaningful, and
    -- leaving it active would let `kiosk_salon_id()` keep resolving if the role
    -- were ever set back without going through here.
    update public.kiosk_devices set is_active = false where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_sync_kiosk_device on public.profiles;
create trigger profiles_sync_kiosk_device
  after insert or update of role, full_name, salon_id on public.profiles
  for each row execute function public.sync_kiosk_device();

-- Backfill: any kiosk profile already created through the Staff form is
-- currently a dead tablet. Give it its device row.
insert into public.kiosk_devices (id, salon_id, label)
select p.id, p.salon_id, coalesce(nullif(trim(p.full_name), ''), 'Kiosk')
from public.profiles p
where p.role::text = 'kiosk'
  and not exists (select 1 from public.kiosk_devices d where d.id = p.id);

-- ----------------------------------------------------------------------------
-- Which salon a kiosk belongs to, for the screen it lands on after signing in.
--
-- `kiosk_context()` deliberately returns nothing for a switched-off device, so
-- the lobby cannot use it to say "this tablet is switched off" — it would get
-- null and have nothing to show. This one always answers, so the screen can
-- explain itself rather than appearing broken.
-- ----------------------------------------------------------------------------
create or replace function public.kiosk_account()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'salon_name',   s.name,
    'device_label', coalesce(d.label, p.full_name),
    'is_active',    coalesce(d.is_active, false),
    'has_device',   d.id is not null,
    'has_exit_pin', s.kiosk_exit_pin_hash is not null
  )
  from public.profiles p
  join public.salons s on s.id = p.salon_id
  left join public.kiosk_devices d on d.id = p.id
  where p.id = auth.uid() and p.role::text = 'kiosk';
$$;

revoke all on function public.kiosk_account() from public;
grant execute on function public.kiosk_account() to authenticated;
