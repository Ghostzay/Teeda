"use server";

import { revalidatePath } from "next/cache";

import { requireManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resetTurn } from "@/lib/turn";
import type { ActionState, UserRole } from "@/lib/types";

export async function updateSalon(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireManager();
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();

  if (!name) return { ok: false, error: "The salon needs a name." };

  const { error } = await supabase.from("salons").update({ name }).eq("id", session.salon.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings", "layout");
  return { ok: true, message: "Salon name updated." };
}

/**
 * Creates a technician login for this salon.
 *
 * Uses the auth admin API (service role) — the caller is verified as a manager
 * first, and the new user's `salon_id` metadata is what the `handle_new_user`
 * trigger uses to place them in the right salon.
 */
export async function createStaff(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireManager();

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = (String(formData.get("role") ?? "tech") as UserRole) satisfies UserRole;

  if (!email || !fullName) return { ok: false, error: "Name and email are required." };
  if (password.length < 8) return { ok: false, error: "Use at least 8 characters for the password." };

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Admin client unavailable." };
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, salon_id: session.salon.id, role },
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true, message: `${fullName} can now sign in with ${email}.` };
}

/** Clock a tech in or out of the rotation without deleting their account. */
export async function toggleStaffActive(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireManager();
  const supabase = await createClient();

  const id = String(formData.get("staff_id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";

  const { error } = await supabase
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("salon_id", session.salon.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true, message: isActive ? "Tech is on the floor." : "Tech is off the rotation." };
}

export async function updateStaffRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireManager();
  const supabase = await createClient();

  const id = String(formData.get("staff_id") ?? "");
  const role = String(formData.get("role") ?? "tech") as UserRole;

  if (id === session.userId) {
    return { ok: false, error: "You can't change your own role." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", id)
    .eq("salon_id", session.salon.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true, message: "Role updated." };
}

/** Send a tech to the back of the rotation (e.g. returning from a long break). */
export async function resetTurnAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  const id = String(formData.get("staff_id") ?? "");

  try {
    await resetTurn(id);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not reset the turn." };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/tech");
  return { ok: true, message: "Turn reset — they're at the back of the rotation." };
}

export async function updateOwnName(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireManager();
  const supabase = await createClient();
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!fullName) return { ok: false, error: "Your name can't be blank." };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", session.userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings", "layout");
  return { ok: true, message: "Name updated." };
}
