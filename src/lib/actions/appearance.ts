"use server";

import { revalidatePath } from "next/cache";

import { getSessionContext, requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isThemeId } from "@/lib/theme";
import type { ActionState } from "@/lib/types";

/**
 * The user's own choice, for their own device.
 *
 * Called fire-and-forget from the theme provider, which has already applied
 * the change locally — so this returns quietly on failure rather than throwing.
 * A dropped write costs the user their preference on their *next* device, not
 * the switch they just made.
 */
export async function saveAppearance(theme: string, mode: string | null): Promise<void> {
  // Deliberately NOT requireSession(): that redirects to /login on failure, and
  // a background write must never navigate the app. If the session has expired
  // while the tablet sat open, the theme still applies locally and the write is
  // simply dropped.
  const session = await getSessionContext();
  if (!session) return;
  if (!isThemeId(theme)) return;

  const supabase = await createClient();
  await supabase.rpc("set_appearance", {
    p_theme: theme,
    p_mode: mode === "light" || mode === "dark" ? mode : undefined,
  });
}

/**
 * The salon's default — what the mounted front-desk tablet shows, and what any
 * user who has not chosen for themselves gets. Owner only.
 */
export async function saveSalonTheme(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();

  const theme = String(formData.get("theme") ?? "");
  if (!isThemeId(theme)) return { ok: false, error: "That theme isn't available." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_salon_theme", { p_theme: theme });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, message: "Salon theme updated." };
}

/** The salon's clock. Everything that says "today" is measured against it. */
export async function saveTimezone(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireManager();

  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!timezone) return { ok: false, error: "Pick a timezone." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("salons")
    .update({ timezone })
    .eq("id", session.salon.id);

  // The database trigger rejects a zone Postgres can't resolve, so a bad value
  // surfaces here as a message rather than silently becoming UTC.
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, message: `The salon day now follows ${timezone}.` };
}
