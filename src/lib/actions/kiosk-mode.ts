"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { getSessionContext } from "@/lib/auth";
import {
  KIOSK_COOKIE,
  clearKioskModeCookie,
  issueKioskMode,
  kioskBrandCookie,
} from "@/lib/kiosk-mode";
import { homeForRole } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Entering and leaving kiosk mode.
 *
 * Both write the cookie server-side. Nothing here trusts, reads or accepts a
 * client-supplied flag — the only thing the browser ever sends is the PIN, and
 * that is compared in SQL.
 */

/**
 * Lock this device to the customer screen. Kiosk accounts only.
 *
 * Two refusals here, and both are the boundary rather than a nicety:
 *
 * 1. The role must really be `kiosk` — `realRole`, not the effective one, so
 *    the check cannot be satisfied by a session already downgraded. A manager,
 *    admin or tech is refused outright. That is not about privilege (the cookie
 *    downgrades the session anyway); it is that turning your own staff account
 *    into a locked tablet is a decision you can make in one tap and undo only
 *    with a PIN you may not have. A kiosk account has nothing to lock itself
 *    out of.
 *
 * 2. The salon must have an exit PIN. Without one there is no way off the
 *    device — five taps would open a prompt that can never be satisfied. A
 *    kiosk with no exit is a bricked tablet, so it does not start.
 *
 * Both are checked here, on the server, because the ready screen's disabled
 * button is a hint and this is the rule.
 */
export async function startKioskMode(): Promise<{ ok: boolean; error?: string }> {
  // `getSessionContext`, not `requireSession` — the latter bounces anyone
  // already in kiosk mode, and starting twice (a double tap) should be a no-op
  // rather than a redirect.
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Please sign in again." };

  if (session.realRole !== "kiosk") {
    return {
      ok: false,
      error:
        "Only a kiosk device account can start kiosk mode. Create one on the Team page with the role set to Kiosk device, then sign in to the tablet with it.",
    };
  }

  const supabase = await createClient();
  const { data: hasPin } = await supabase.rpc("salon_has_exit_pin");
  if (!hasPin) {
    return {
      ok: false,
      error:
        "Set a manager PIN first, in Settings → Check-in tablets. Without one there is no way to leave kiosk mode on this device.",
    };
  }

  const jar = await cookies();
  // Reuse the device key if there is one, so the PIN lockout follows the device
  // across sessions rather than resetting every time somebody starts again.
  const existing = jar.get(KIOSK_COOKIE)?.value?.split(".")[0];
  const deviceKey = existing && existing.length > 0 ? existing : crypto.randomUUID();

  let issued;
  try {
    issued = await issueKioskMode(session.userId, deviceKey);
  } catch {
    // No signing secret: without one the flag cannot be enforced, and a kiosk
    // mode that is not enforced is worse than none — it looks locked and is not.
    return { ok: false, error: "Kiosk mode is not configured on this server." };
  }

  jar.set(KIOSK_COOKIE, issued.value, issued.options);

  // Remember the branding while there is still a session to read it from. This
  // is the only moment we are certain of both, and the screen that needs them
  // is the one where the session has gone.
  const brand = kioskBrandCookie({
    salonName: session.salon.name,
    deviceLabel: session.profile.full_name,
  });
  jar.set(brand.name, brand.value, brand.options);

  // Bookkeeping for the manager's device list: which tablets are locked right
  // now, so a manager can tell from Settings without walking over to look.
  await supabase.rpc("kiosk_mark_mode", { p_entered: true });

  revalidatePath("/", "layout");
  return { ok: true };
}

export type ExitResult =
  | { result: "ok"; to: string }
  | { result: "wrong" | "locked_out" | "no_pin" | "denied" };

/**
 * Leave kiosk mode.
 *
 * The PIN is compared in SQL against a bcrypt hash, and the attempt is counted
 * there too — five failures inside five minutes locks that device out. Counting
 * in the browser would mean counting in the thing being attacked.
 *
 * Deliberately does not say how many attempts remain. "Wrong PIN" and "wrong
 * PIN, two left" are different amounts of help to somebody guessing.
 */
export async function exitKioskMode(pin: string): Promise<ExitResult> {
  const session = await getSessionContext();
  if (!session) return { result: "denied" };

  const jar = await cookies();
  const deviceKey = jar.get(KIOSK_COOKIE)?.value?.split(".")[0] ?? "unknown";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kiosk_verify_exit_pin", {
    p_pin: pin,
    p_device_key: deviceKey,
  });

  if (error || !data) return { result: "denied" };

  const outcome = (data as { result: ExitResult["result"] }).result;
  if (outcome !== "ok") return { result: outcome };

  for (const cookie of clearKioskModeCookie()) {
    jar.set(cookie.name, cookie.value, cookie.options);
  }

  await supabase.rpc("kiosk_mark_mode", { p_entered: false });
  revalidatePath("/", "layout");

  // A kiosk account lands back on its ready screen.
  //
  // The `realRole` branch is not dead code: only kiosk accounts can *start*
  // kiosk mode now, but a manager who started it under the old rule still has
  // a valid year-long cookie on their tablet. They must still be able to get
  // out, and out means their own dashboard. Remove this branch and that device
  // exits into /kiosk/ready, which a manager account cannot render.
  return {
    result: "ok",
    to: session.realRole === "kiosk" ? "/kiosk/ready" : homeForRole(session.realRole),
  };
}

/**
 * Keep the tablet's session alive, and say plainly when it is not.
 *
 * A wall-mounted tablet can sit on one screen for a fortnight without a single
 * navigation. Nothing in the app refreshes the token in that time — the
 * middleware does it on every *request*, and there are no requests. The refresh
 * token eventually expires and the next customer to touch the screen gets a
 * login form, which they cannot satisfy and should never have been shown.
 *
 * This is a Server Action rather than a Route Handler because that is the other
 * place `@supabase/ssr` is allowed to write cookies back — `getUser()` here
 * really does rotate the token and persist it, where the same call in a Server
 * Component silently cannot.
 *
 * Returns `false` for a session that could not be recovered. The caller shows
 * the stalled screen; it never shows a login form.
 */
export async function refreshKioskSession(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user !== null;
  } catch {
    // A network blip is not a dead session. The kiosk shell already shows an
    // offline banner for that, and the next beat will settle it either way.
    return true;
  }
}

/**
 * The way off the stalled screen.
 *
 * No PIN, deliberately. The PIN exists to stop a customer stepping out of the
 * kiosk and into a live staff session — and on this screen there is no live
 * session to step into. Whoever taps through lands on a login form, which is
 * exactly as far as they could get from their own phone. Demanding a PIN we
 * have no working session to verify would mean an expired token bricks the
 * tablet until somebody clears its browser storage.
 */
export async function clearStalledKiosk(): Promise<void> {
  const jar = await cookies();
  for (const cookie of clearKioskModeCookie()) {
    jar.set(cookie.name, cookie.value, cookie.options);
  }
}

/** Stamp the device's last sign-in, for the manager list. */
export async function touchKioskSignIn(): Promise<void> {
  const session = await getSessionContext();
  if (!session || session.realRole !== "kiosk") return;
  const supabase = await createClient();
  await supabase.rpc("kiosk_touch_sign_in");
}

/** Whether this session is currently downgraded. Server-read, for the nav. */
export async function isInKioskMode(): Promise<boolean> {
  const session = await getSessionContext();
  return session?.kioskMode ?? false;
}

/**
 * Whether this session may start kiosk mode — the same rule `startKioskMode`
 * enforces, exported so a screen can disable the button instead of letting
 * someone press it into an error. The button is the courtesy; the check inside
 * `startKioskMode` is the rule, and it does not consult this.
 */
export async function canStartKioskMode(): Promise<boolean> {
  const session = await getSessionContext();
  if (!session || session.kioskMode) return false;
  if (session.realRole !== "kiosk") return false;

  const supabase = await createClient();
  const { data } = await supabase.rpc("salon_has_exit_pin");
  return Boolean(data);
}
