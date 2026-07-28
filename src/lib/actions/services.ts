"use server";

import { revalidatePath } from "next/cache";

import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState, Skill } from "@/lib/types";

function parsePrice(raw: FormDataEntryValue | null): number | null {
  const cleaned = String(raw ?? "").replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;

  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;

  return Math.round(value * 100) / 100;
}

function revalidateMenu() {
  revalidatePath("/settings");
  revalidatePath("/jobs");
  revalidatePath("/appointments");
  revalidatePath("/dashboard");
}

/** Add or edit a service. The price list is a manager decision. */
export async function upsertService(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireManager();
  const supabase = await createClient();

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const price = parsePrice(formData.get("price"));
  const durationRaw = String(formData.get("duration_minutes") ?? "").trim();
  const skills = formData.getAll("required_skills").map(String) as Skill[];
  const isActive = formData.get("is_active") !== "false";

  if (!name) return { ok: false, error: "Give the service a name." };
  if (price === null) return { ok: false, error: "Enter the price as a number, e.g. 45 or 45.00." };

  const duration = durationRaw ? Number(durationRaw) : null;
  if (duration !== null && (!Number.isFinite(duration) || duration <= 0)) {
    return { ok: false, error: "Duration must be a number of minutes." };
  }

  const values = {
    name,
    price,
    duration_minutes: duration,
    required_skills: skills,
    is_active: isActive,
  };

  const { error } = id
    ? await supabase.from("services").update(values).eq("id", id).eq("salon_id", session.salon.id)
    : await supabase.from("services").insert({ ...values, salon_id: session.salon.id });

  if (error) {
    // The (salon_id, name) unique index is the likely culprit.
    if (error.code === "23505") {
      return { ok: false, error: `“${name}” is already on the menu.` };
    }
    return { ok: false, error: error.message };
  }

  revalidateMenu();
  return { ok: true, message: id ? "Service updated." : "Service added." };
}

/**
 * Remove a service. Past jobs keep their snapshotted name and price, so
 * deleting never rewrites history.
 */
export async function deleteService(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireManager();
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");

  const { error } = await supabase
    .from("services")
    .delete()
    .eq("id", id)
    .eq("salon_id", session.salon.id);

  if (error) return { ok: false, error: error.message };

  revalidateMenu();
  return { ok: true, message: "Service removed." };
}

/** House split and pay period length. */
export async function updatePaySettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireManager();
  const supabase = await createClient();

  const split = Number(String(formData.get("tech_split_percent") ?? "").replace(/[^0-9.]/g, ""));
  const days = Number(String(formData.get("pay_period_days") ?? "").replace(/[^0-9]/g, ""));

  if (!Number.isFinite(split) || split < 0 || split > 100) {
    return { ok: false, error: "The tech split must be between 0 and 100." };
  }
  if (!Number.isFinite(days) || days < 1 || days > 31) {
    return { ok: false, error: "The pay period must be between 1 and 31 days." };
  }

  const { error } = await supabase.rpc("update_salon_pay_settings", {
    p_split_percent: split,
    p_pay_period_days: days,
    p_anchor: null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/tech");
  return { ok: true, message: `Techs now take ${split}% of service revenue.` };
}
