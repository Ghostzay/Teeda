import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { KIOSK_COOKIE, readKioskMode } from "@/lib/kiosk-mode";
import { homeForRole } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SessionContext, UserRole } from "@/lib/types";

/** The raw auth user, with no profile requirement. */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Resolves the signed-in user, their profile and their salon.
 * Returns null if the user is signed out *or* not yet attached to a salon —
 * callers distinguish the two with `getAuthUser`.
 *
 * `cache` dedupes this across every component in a single render pass.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return null;

  const { data: salon } = await supabase
    .from("salons")
    .select("*")
    .eq("id", profile.salon_id)
    .maybeSingle();

  if (!salon) return null;

  // The session downgrade.
  //
  // Read here, once, so that EVERY server component, server action and query
  // helper in the app sees it — they all resolve their role through this
  // object. A manager who started kiosk mode on the front tablet is a kiosk
  // from this line onward: `canManageFloor` false, `isManager` false, and
  // `requireManager()` turns them away. Not hidden UI — a different session.
  //
  // `realRole` is kept so the exit can put them back, and so the kiosk screen
  // can say whose session it is borrowing.
  const kioskMode = await readKioskMode((await cookies()).get(KIOSK_COOKIE)?.value, user.id);
  const effectiveRole: UserRole = kioskMode ? "kiosk" : profile.role;

  return {
    userId: user.id,
    email: user.email ?? "",
    profile,
    salon,
    role: effectiveRole,
    realRole: profile.role,
    kioskMode: kioskMode !== null,
    kioskDeviceKey: kioskMode?.deviceKey ?? null,
    isSuperAdmin: effectiveRole === "super_admin",
    // The owner is a manager with extra rights, not a separate track — the
    // SQL helpers agree, so settings never lock the owner out.
    isManager: effectiveRole === "manager" || effectiveRole === "super_admin",
    isAdmin: effectiveRole === "admin",
    isTech: effectiveRole === "tech",
    isKiosk: effectiveRole === "kiosk",
    // An allow-list, not `role !== "tech"`.
    //
    // Deny-by-exception reads the same until the day a role is added, and then
    // it silently grants: `kiosk` would have arrived holding floor access —
    // rendering the dashboard, the queue and the payment controls on a tablet
    // pointed at the waiting room. The SQL side (`can_manage_floor()`) has
    // always been an allow-list; this is the app agreeing with it.
    canManageFloor: FLOOR_ROLES.includes(effectiveRole),
  };
});

/** Who may work the floor. Mirrors `can_manage_floor()` in SQL, exactly. */
const FLOOR_ROLES: UserRole[] = ["manager", "admin", "super_admin"];

/**
 * Use in any authenticated page/action. Redirects instead of returning null.
 *
 * A kiosk is bounced here rather than only in the middleware. Every staff page
 * in the app already funnels through this function, so closing it here closes
 * all of them at once — including any page added later, whose author will not
 * think about kiosks. The middleware does the same check earlier and cheaper;
 * this is the one that cannot be skipped by a route the matcher misses.
 */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  if (session.isKiosk) redirect("/kiosk");
  return session;
}

/** Manager only — salon settings, the team roster, takings. */
export async function requireManager(): Promise<SessionContext> {
  const session = await requireSession();
  if (!session.isManager) redirect(homeForRole(session.role));
  return session;
}

/** Manager or admin — check-ins, jobs, the queue, payments. */
export async function requireFloorAccess(): Promise<SessionContext> {
  const session = await requireSession();
  if (!session.canManageFloor) redirect(session.isKiosk ? "/kiosk" : "/tech");
  return session;
}

/**
 * The kiosk's own guard.
 *
 * The middleware already keeps other roles off /kiosk, but middleware is a
 * redirect, not a boundary: it does not run on every path a request can take
 * to a Server Component, and a matcher is one config edit away from a hole.
 * This runs inside the layout, so the page cannot render without it.
 */
export async function requireKiosk(): Promise<SessionContext> {
  // Deliberately `getSessionContext`, not `requireSession` — that one bounces
  // kiosks to /kiosk, which from inside /kiosk is a redirect loop.
  const session = await getSessionContext();
  if (!session) redirect("/login");
  if (!session.isKiosk) redirect(homeForRole(session.role));
  return session;
}
