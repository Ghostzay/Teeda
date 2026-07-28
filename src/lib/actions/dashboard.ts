"use server";

import { revalidatePath } from "next/cache";

import { requireFloorAccess, requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { StoredLayout } from "@/lib/dashboard";
import type { ActionState } from "@/lib/types";

/**
 * Save this user's dashboard arrangement.
 *
 * Takes the layout as an argument rather than a FormData because the canvas
 * holds it as state, not as form fields — there is no form to serialise.
 */
export async function saveDashboardLayout(layout: StoredLayout): Promise<ActionState> {
  await requireFloorAccess();

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_dashboard_layout", { p_layout: layout });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true, message: "Dashboard saved." };
}

/**
 * Make this the layout a new manager or admin starts with.
 *
 * Only affects people who have not arranged their own — the resolution order is
 * user layout, then salon default, then the recommended one.
 */
export async function saveSalonDashboardLayout(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireManager();

  const raw = String(formData.get("layout") ?? "");
  let layout: StoredLayout;
  try {
    layout = JSON.parse(raw) as StoredLayout;
  } catch {
    return { ok: false, error: "That layout couldn't be read." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_salon_dashboard_layout", { p_layout: layout });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "New managers and admins will start with this layout." };
}
