"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { getSessionContext, requireSession } from "@/lib/auth";
import { KIOSK_COOKIE, clearKioskModeCookie, issueKioskMode } from "@/lib/kiosk-mode";
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
 * Lock this device to the customer screen.
 *
 * Available to every signed-in role. A manager doing this on the front tablet
 * is downgraded for the duration: `getSessionContext` reads the same cookie and
 * hands back a kiosk session, so `requireManager()` turns them away and every
 * data call goes through the kiosk's RLS. Being one typed URL from the takings
 * is exactly what this exists to prevent.
 */
export async function startKioskMode(): Promise<{ ok: boolean; error?: string }> {
  // `getSessionContext`, not `requireSession` — the latter bounces anyone
  // already in kiosk mode, and starting twice (a double tap) should be a no-op
  // rather than a redirect.
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Please sign in again." };

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

  // Best-effort bookkeeping for the manager's device list. A kiosk-role account
  // has a device row; anyone else does not, and the RPC quietly updates nothing.
  const supabase = await createClient();
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

  const cleared = clearKioskModeCookie();
  jar.set(cleared.name, cleared.value, cleared.options);

  await supabase.rpc("kiosk_mark_mode", { p_entered: false });
  revalidatePath("/", "layout");

  // A kiosk-role account has nowhere else to be, so it lands back on the ready
  // screen. Everybody else gets their real role's home — the downgrade is
  // over, and `realRole` is what it was before any of this started.
  return {
    result: "ok",
    to: session.realRole === "kiosk" ? "/kiosk/ready" : homeForRole(session.realRole),
  };
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

/** Guard for the "Start kiosk mode" control: any signed-in staff role. */
export async function canStartKioskMode(): Promise<boolean> {
  const session = await requireSession();
  return !session.kioskMode;
}
