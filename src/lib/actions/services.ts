"use server";

import { revalidatePath } from "next/cache";

import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ALL_SERVICE_CATEGORIES, type ActionState, type ServiceCategory, type Skill } from "@/lib/types";

function parsePrice(raw: FormDataEntryValue | null): number | null {
  const cleaned = String(raw ?? "").replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;

  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;

  return Math.round(value * 100) / 100;
}

function revalidateMenu() {
  revalidatePath("/services");
  revalidatePath("/settings");
  revalidatePath("/jobs");
  revalidatePath("/appointments");
  revalidatePath("/dashboard");
}

/**
 * Add or edit a service. The price list is a manager decision.
 *
 * Goes through `save_service` rather than writing the table directly, because
 * the category now carries a base skill: the RPC strips a redundantly-typed
 * base skill back out, so an empty skill list on a manicure keeps meaning
 * "inherits Manicure" instead of drifting into a stale literal requirement the
 * next time someone changes the category.
 */
export async function upsertService(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  const supabase = await createClient();

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const price = parsePrice(formData.get("price"));
  const durationRaw = String(formData.get("duration_minutes") ?? "").trim();
  const sortRaw = String(formData.get("sort_order") ?? "").trim();
  const skills = formData.getAll("required_skills").map(String) as Skill[];
  const isActive = formData.get("is_active") !== "false";

  const category = String(formData.get("category") ?? "") as ServiceCategory;
  if (!ALL_SERVICE_CATEGORIES.includes(category)) {
    return { ok: false, error: "Pick which part of the menu this belongs to." };
  }

  if (!name) return { ok: false, error: "Give the service a name." };
  if (price === null) return { ok: false, error: "Enter the price as a number, e.g. 45 or 45.00." };

  const duration = durationRaw ? Number(durationRaw) : null;
  if (duration !== null && (!Number.isFinite(duration) || duration <= 0)) {
    return { ok: false, error: "Duration must be a number of minutes." };
  }

  const sortOrder = sortRaw ? Number(sortRaw) : null;
  if (sortOrder !== null && !Number.isFinite(sortOrder)) {
    return { ok: false, error: "Menu position must be a number." };
  }

  const { error } = await supabase.rpc("save_service", {
    p_id: id || null,
    p_name: name,
    p_category: category,
    p_price: price,
    p_minutes: duration,
    p_skills: skills,
    p_is_active: isActive,
    p_sort_order: sortOrder,
  });

  if (error) {
    if (error.code === "23505") return { ok: false, error: `“${name}” is already on the menu.` };
    return { ok: false, error: error.message };
  }

  revalidateMenu();
  return { ok: true, message: id ? "Service updated." : "Service added." };
}

/**
 * Show or hide one item without opening the editor.
 *
 * Seasonal items come and go, and deleting them would mean re-typing the price
 * and skills every spring. Hidden items stay off the booking and check-in
 * pickers but keep their history intact.
 */
export async function setServiceActive(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireManager();
  const supabase = await createClient();

  const id = String(formData.get("id") ?? "").trim();
  const active = formData.get("is_active") === "true";
  if (!id) return { ok: false, error: "That service no longer exists." };

  const { error } = await supabase
    .from("services")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateMenu();
  return { ok: true, message: active ? "Back on the menu." : "Hidden from the menu." };
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
