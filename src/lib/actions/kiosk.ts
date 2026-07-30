"use server";

import { requireKiosk, requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { ActionState, KioskCheckin, KioskContext, KioskLookup } from "@/lib/types";

/**
 * Everything the kiosk can do, as server actions.
 *
 * The device never holds a Supabase client of its own beyond the session
 * cookie, and every one of these calls a SECURITY DEFINER RPC. There is no
 * `.from("customers")` anywhere in this file, and there could not be one that
 * worked: the restrictive policies added in 20260728230000 refuse a kiosk on
 * every table that matters.
 */

/** Salon name and device label for the idle screen. */
export async function kioskContext(): Promise<KioskContext | null> {
  await requireKiosk();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kiosk_context");
  if (error || !data) return null;
  return data as KioskContext;
}

/**
 * Look a client up by their full number.
 *
 * Returns the RPC's answer unchanged. Resisting the urge to add a friendlier
 * error here is the point: any branch this layer adds is a branch a stranger
 * can time or read, and the RPC has already flattened every failure into one
 * indistinguishable `no_match`.
 */
export async function kioskLookup(phone: string): Promise<KioskLookup> {
  await requireKiosk();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("kiosk_lookup_client", { p_phone: phone });
  if (error || !data) return { result: "no_match" };
  return data as KioskLookup;
}

/** Check a booking in. Re-validated server-side; the screen's answer is stale. */
export async function kioskCheckin(appointmentId: string): Promise<KioskCheckin> {
  await requireKiosk();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("kiosk_checkin", {
    p_appointment_id: appointmentId,
  });
  if (error || !data) return { result: "not_found" };

  // The client is now in the rotation, so every screen that reads it is stale.
  revalidatePath("/dashboard");
  revalidatePath("/tech");
  revalidatePath("/jobs");
  revalidatePath("/schedule");

  return data as KioskCheckin;
}

/** The hidden exit. Compared in SQL — the PIN never reaches the device. */
export async function kioskVerifyExitPin(pin: string): Promise<boolean> {
  await requireKiosk();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kiosk_check_exit_pin", { p_pin: pin });
  return !error && data === true;
}

/** Sign the device out. Only reachable behind the PIN. */
export async function kioskSignOut(): Promise<void> {
  await requireKiosk();
  const supabase = await createClient();
  await supabase.auth.signOut();
}

// ---------------------------------------------------------------------------
// Manager side
// ---------------------------------------------------------------------------

/**
 * Register a tablet.
 *
 * Two steps that must both land: an auth user (service role, no email
 * confirmation — a device has no inbox) and the profile + device rows. The RPC
 * does the second half in one statement so a half-made kiosk — an auth user
 * with no profile, which would sit in a redirect loop forever — cannot exist.
 */
export async function addKioskDevice(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireManager();

  const label = String(formData.get("label") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!label) return { ok: false, error: "Give the device a name, like “Front desk iPad”." };
  if (password.length < 12) {
    return { ok: false, error: "Use a device passphrase of at least 12 characters." };
  }

  const admin = createAdminClient();

  // A device has no mailbox, so the address is synthetic and confirmed on
  // creation. It is a credential, not a contact.
  const email = `kiosk-${crypto.randomUUID()}@device.invalid`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { salon_id: session.salon.id, kiosk: true },
  });

  if (createError || !created.user) {
    return { ok: false, error: createError?.message ?? "Couldn't create the device account." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_kiosk_device", {
    p_user_id: created.user.id,
    p_label: label,
  });

  if (error) {
    // Roll the auth user back rather than leaving an orphan that can sign in
    // with no profile and no restrictive policy applying to it.
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: error.message };
  }

  revalidatePath("/settings");
  return {
    ok: true,
    message: `“${label}” is ready. Sign in on the tablet with ${email}.`,
  };
}

/** Switch a device off. Takes effect on its very next request. */
export async function setKioskDeviceActive(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireManager();
  const supabase = await createClient();

  const id = String(formData.get("id") ?? "");
  const active = formData.get("is_active") === "true";

  const { error } = await supabase
    .from("kiosk_devices")
    .update({ is_active: active })
    .eq("id", id)
    .eq("salon_id", session.salon.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true, message: active ? "Device switched on." : "Device switched off." };
}

/** The PIN that unlocks the kiosk's hidden exit. Stored hashed. */
export async function setKioskExitPin(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireManager();
  const supabase = await createClient();

  const pin = String(formData.get("pin") ?? "").trim();
  if (!/^\d{4,8}$/.test(pin)) return { ok: false, error: "The PIN must be 4 to 8 digits." };

  const { error } = await supabase.rpc("set_kiosk_exit_pin", { p_pin: pin });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true, message: "Kiosk PIN saved." };
}
