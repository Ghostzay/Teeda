"use server";

import { revalidatePath } from "next/cache";

import { requireFloorAccess, requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState, Skill } from "@/lib/types";
import { ALL_SKILLS } from "@/lib/types";

/** Anything the form didn't fill in is cleared — the row is replaced whole. */
const text = (form: FormData, key: string): string | null => {
  const value = String(form.get(key) ?? "").trim();
  return value === "" ? null : value;
};

/**
 * Save a team member's profile.
 *
 * Every field is sent every time, because `save_tech_profile` replaces the row
 * — that is what lets an emptied box actually clear the value rather than
 * leaving the old one behind with no way to remove it.
 */
export async function saveTechProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireManager();

  const techId = String(formData.get("tech_id") ?? "");
  if (!techId) return { ok: false, error: "Which team member?" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_tech_profile", {
    p_tech_id: techId,
    p_phone: text(formData, "phone"),
    p_email: text(formData, "email"),
    p_started_on: text(formData, "started_on"),
    p_pronouns: text(formData, "pronouns"),
    p_bio: text(formData, "bio"),
    p_specialties: text(formData, "specialties"),
    p_certifications: text(formData, "certifications"),
    p_emergency_contact: text(formData, "emergency_contact"),
    p_emergency_phone: text(formData, "emergency_phone"),
    p_manager_notes: text(formData, "manager_notes"),
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/staff");
  return { ok: true, message: "Profile saved." };
}

/** The extra client fields — contact, birthday, allergies, who they ask for. */
export async function saveCustomerDetails(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireFloorAccess();

  const id = String(formData.get("customer_id") ?? "");
  if (!id) return { ok: false, error: "Which client?" };

  const preferred = String(formData.get("preferred_tech_id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_customer_details", {
    p_id: id,
    p_email: text(formData, "email"),
    p_birthday: text(formData, "birthday"),
    p_allergies: text(formData, "allergies"),
    p_preferred_tech_id: preferred && preferred !== "none" ? preferred : null,
    p_clear_preferred: preferred === "none",
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/customers");
  return { ok: true, message: "Client updated." };
}

function parseSkills(form: FormData, key: string): Skill[] {
  return form
    .getAll(key)
    .map(String)
    .filter((value): value is Skill => (ALL_SKILLS as string[]).includes(value));
}

/**
 * Add or remove skills across one tech, several, or the whole team.
 *
 * Add and remove travel together because a correction is usually both — "they
 * do gel now, not acrylic" — and splitting it into two calls leaves a window
 * where the rotation sees a tech with neither.
 */
export async function updateSkills(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();

  const scope = String(formData.get("scope") ?? "selected");
  const techIds = formData.getAll("tech_ids").map(String).filter(Boolean);
  const add = parseSkills(formData, "add");
  const remove = parseSkills(formData, "remove");

  if (add.length === 0 && remove.length === 0) {
    return { ok: false, error: "Pick at least one skill to add or remove." };
  }
  if (scope === "selected" && techIds.length === 0) {
    return { ok: false, error: "Choose who to change, or switch to the whole team." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bulk_update_skills", {
    p_tech_ids: scope === "everyone" ? null : techIds,
    p_add: add,
    p_remove: remove,
  });

  if (error) return { ok: false, error: error.message };

  const count = Number(data ?? 0);
  const parts = [
    add.length > 0 ? `added ${add.length}` : null,
    remove.length > 0 ? `removed ${remove.length}` : null,
  ].filter(Boolean);

  revalidatePath("/staff");
  return {
    ok: true,
    message: `${parts.join(", ")} across ${count} ${count === 1 ? "tech" : "techs"}.`,
  };
}
