import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { SessionContext } from "@/lib/types";

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

  return {
    userId: user.id,
    email: user.email ?? "",
    profile,
    salon,
    role: profile.role,
    isSuperAdmin: profile.role === "super_admin",
    // The owner is a manager with extra rights, not a separate track — the
    // SQL helpers agree, so settings never lock the owner out.
    isManager: profile.role === "manager" || profile.role === "super_admin",
    isAdmin: profile.role === "admin",
    isTech: profile.role === "tech",
    canManageFloor: profile.role !== "tech",
  };
});

/** Use in any authenticated page/action. Redirects instead of returning null. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  return session;
}

/** Manager only — salon settings, the team roster, takings. */
export async function requireManager(): Promise<SessionContext> {
  const session = await requireSession();
  if (!session.isManager) redirect(session.canManageFloor ? "/dashboard" : "/tech");
  return session;
}

/** Manager or admin — check-ins, jobs, the queue, payments. */
export async function requireFloorAccess(): Promise<SessionContext> {
  const session = await requireSession();
  if (!session.canManageFloor) redirect("/tech");
  return session;
}
