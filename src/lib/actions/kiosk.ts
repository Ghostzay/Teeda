"use server";

import { requireKiosk, requireManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  ActionState,
  KioskAccount,
  KioskBooking,
  KioskCheckin,
  KioskContext,
  KioskLookup,
  KioskService,
  KioskSlot,
  KioskTechOption,
} from "@/lib/types";

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

/**
 * The kiosk account itself, for the lobby.
 *
 * Distinct from `kioskContext()`, which deliberately returns nothing for a
 * switched-off device — the lobby needs to *say* the tablet is switched off,
 * and it cannot do that from a null.
 */
export async function kioskAccount(): Promise<KioskAccount | null> {
  await requireKiosk();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kiosk_account");
  if (error || !data) return null;
  return data as KioskAccount;
}

// ---------------------------------------------------------------------------
// Manager side
// ---------------------------------------------------------------------------

/*
 * `addKioskDevice()` lived here. It made an auth user with a synthetic
 * `@device.invalid` address, which meant a kiosk was provisioned rather than
 * employed — a second, parallel way to create an account. A kiosk is now a
 * staff account like any other: made on the Team page with a real email and a
 * role of Kiosk, and a trigger on `profiles` creates the device row whichever
 * route the account arrives by.
 */

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

  // 4 to 6 digits, matching `set_kiosk_exit_pin` exactly. They disagreed before
  // — this accepted 8 and the RPC rejected it — so a 7-digit PIN passed the
  // form and came back as a raw Postgres error.
  //
  // Kept as text throughout. "0042" is a valid PIN; parse it as a number
  // anywhere along the way and it becomes 42, a PIN nobody can ever enter.
  const pin = String(formData.get("pin") ?? "").trim();
  if (!/^\d{4,6}$/.test(pin)) return { ok: false, error: "The PIN must be 4 to 6 digits." };

  const { error } = await supabase.rpc("set_kiosk_exit_pin", { p_pin: pin });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true, message: "Kiosk PIN saved." };
}

// ---------------------------------------------------------------------------
// Walk-in booking
//
// Every one of these is a thin pass-through to an RPC. That is the design, not
// laziness: availability is computed in exactly one place — `kiosk_available_
// slots` — and any arithmetic added here would be a second answer to the same
// question, reachable from a device a customer is holding.
// ---------------------------------------------------------------------------

/** The bookable menu. Active services only, straight from the table. */
export async function kioskServices(): Promise<KioskService[]> {
  await requireKiosk();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kiosk_service_menu");
  if (error) return [];
  return (data ?? []).map((row) => ({ ...row, price: Number(row.price) }));
}

/**
 * Who can take this basket today, soonest first.
 *
 * Queried, not filtered: a tech who is not on shift, lacks a required skill, or
 * has no remaining gap long enough never leaves the database.
 */
export async function kioskTechs(serviceIds: string[]): Promise<KioskTechOption[]> {
  await requireKiosk();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kiosk_available_techs", {
    p_service_ids: serviceIds,
    p_day: null,
  });
  if (error) return [];
  return data ?? [];
}

/** Bookable start times. `techId` null means "first available". */
export async function kioskSlots(
  serviceIds: string[],
  techId: string | null,
): Promise<KioskSlot[]> {
  await requireKiosk();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kiosk_available_slots", {
    p_service_ids: serviceIds,
    p_tech_id: techId,
    p_day: null,
  });
  if (error) return [];
  return data ?? [];
}

/** Minimal registration. Five fields, and no way to reach an existing record. */
export async function kioskRegister(fields: {
  first: string;
  last: string;
  phone: string;
  language: string;
  sensitivities: string;
}): Promise<{ id: string | null; error: string | null }> {
  await requireKiosk();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("kiosk_register_client", {
    p_first: fields.first,
    p_last: fields.last,
    p_phone: fields.phone,
    p_language: fields.language,
    p_sensitivities: fields.sensitivities || null,
  });

  if (error) return { id: null, error: error.message };
  return { id: data as string, error: null };
}

/**
 * Book it.
 *
 * The slot the tablet sends is a claim, not a fact: the RPC re-validates it
 * inside the writing transaction, and the exclusion constraint on
 * `schedule_blocks` settles anything that slips between. A `taken` result means
 * somebody won the race and the caller must redraw the times — never retry.
 */
export async function kioskBook(args: {
  customerId: string;
  serviceIds: string[];
  techId: string | null;
  startsAt: string;
}): Promise<KioskBooking> {
  await requireKiosk();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("kiosk_book", {
    p_customer_id: args.customerId,
    p_service_ids: args.serviceIds,
    p_tech_id: args.techId,
    p_starts_at: args.startsAt,
  });

  if (error || !data) return { result: "taken" };

  // A real appointment now exists, so every screen that draws the day is stale.
  revalidatePath("/dashboard");
  revalidatePath("/tech");
  revalidatePath("/schedule");
  revalidatePath("/appointments");

  return data as KioskBooking;
}

/**
 * Generate a fresh password for a tablet, and hand it back exactly once.
 *
 * A device password is not a memorised secret — it is typed once on a tablet
 * and then never again. Making a manager invent one means it will be
 * "salon2024", so this generates it. The plaintext is returned to the caller
 * and never stored anywhere: the only copy is the one on screen, which is why
 * the UI makes you confirm you saved it before it disappears.
 */
export async function resetKioskPassword(
  deviceId: string,
): Promise<{ ok: boolean; email?: string; password?: string; error?: string }> {
  const session = await requireManager();
  const supabase = await createClient();

  const { data: device } = await supabase
    .from("kiosk_devices")
    .select("id, label")
    .eq("id", deviceId)
    .eq("salon_id", session.salon.id)
    .maybeSingle();

  if (!device) return { ok: false, error: "That tablet is not on this salon." };

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Admin client unavailable." };
  }

  const password = generateDevicePassword();
  const { data: updated, error } = await admin.auth.admin.updateUserById(deviceId, {
    password,
    // A device has no inbox to confirm from, and a tablet that cannot sign in
    // until somebody clicks a link in an email nobody owns is a dead tablet.
    email_confirm: true,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true, email: updated.user?.email ?? "", password };
}

/**
 * Six groups of four, from an unambiguous alphabet.
 *
 * No 0/O, 1/l/I: this gets read off a laptop and typed on a tablet keyboard,
 * often by somebody who did not generate it. Ambiguity there costs a support
 * call, and the entropy lost is nothing next to the length.
 */
function generateDevicePassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(24);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((n) => alphabet[n % alphabet.length]);
  return [0, 4, 8, 12, 16, 20].map((i) => chars.slice(i, i + 4).join("")).join("-");
}
