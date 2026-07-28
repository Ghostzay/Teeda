"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

function revalidateSchedule() {
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  revalidatePath("/tech");
}

/**
 * Create or update a shift. `id` empty means create.
 *
 * Times arrive as the salon's wall clock (a date plus two times), which is how
 * they were entered on the grid.
 */
export async function saveShift(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();

  const id = String(formData.get("id") ?? "").trim() || null;
  const techId = String(formData.get("tech_id") ?? "") || session.userId;
  const date = String(formData.get("date") ?? "");
  const start = String(formData.get("start_time") ?? "");
  const end = String(formData.get("end_time") ?? "");
  const kind = String(formData.get("kind") ?? "shift");
  const note = String(formData.get("note") ?? "").trim();

  if (!date || !start || !end) {
    return { ok: false, error: "Pick a date, a start time and an end time." };
  }

  const startsAt = new Date(`${date}T${start}`);
  const endsAt = new Date(`${date}T${end}`);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { ok: false, error: "That date and time isn't valid." };
  }
  if (endsAt <= startsAt) {
    return { ok: false, error: "The end time has to be after the start time." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_shift", {
    p_id: id,
    p_tech_id: techId,
    p_starts_at: startsAt.toISOString(),
    p_ends_at: endsAt.toISOString(),
    p_kind: kind,
    p_note: note || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidateSchedule();
  return { ok: true, message: id ? "Shift updated." : "Shift added." };
}

export async function deleteShift(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_shift", { p_id: id });

  if (error) return { ok: false, error: error.message };

  revalidateSchedule();
  return { ok: true, message: "Shift removed." };
}
