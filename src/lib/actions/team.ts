"use server";

import { revalidatePath } from "next/cache";

import { requireManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

/**
 * Remove someone from the team for good.
 *
 * The database refuses if they have completed services or payments, because
 * `jobs.tech_id` and `payments.tech_id` are ON DELETE SET NULL — deleting
 * would not fail, it would quietly detach every service they performed and
 * every payment they were owed, changing the shape of a past pay period.
 * Deactivation exists for that case.
 *
 * The login goes too, so the email can be reused. That needs the service role;
 * if it isn't configured the profile is still gone and we say so rather than
 * pretending the whole thing worked.
 */
export async function deleteTech(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireManager();

  const techId = String(formData.get("tech_id") ?? "");
  if (!techId) return { ok: false, error: "Which team member?" };
  if (techId === session.userId) return { ok: false, error: "You can't remove your own account." };

  const supabase = await createClient();
  const { data: name, error } = await supabase.rpc("delete_tech", { p_tech_id: techId });

  if (error) return { ok: false, error: error.message };

  let authNote = "";
  try {
    const admin = createAdminClient();
    const { error: authError } = await admin.auth.admin.deleteUser(techId);
    if (authError) authNote = " Their login still exists — remove it in Supabase.";
  } catch {
    authNote = " Their login still exists — remove it in Supabase.";
  }

  revalidatePath("/staff");
  return { ok: true, message: `${name ?? "They"} have been removed.${authNote}` };
}
