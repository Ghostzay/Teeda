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
    isManager: profile.role === "manager",
  };
});

/** Use in any authenticated page/action. Redirects instead of returning null. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  return session;
}

/** Use in manager-only pages/actions. */
export async function requireManager(): Promise<SessionContext> {
  const session = await requireSession();
  if (!session.isManager) redirect("/tech");
  return session;
}
