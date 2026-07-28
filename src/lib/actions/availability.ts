"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

/**
 * Mark a day: "I'm in 9 to 5", or an errand carved out of it.
 *
 * The date and the two clock times go to the database as-is and are resolved
 * against the salon's timezone there. The browser is never asked to build the
 * instant, because a tablet's clock and the salon's clock are not the same
 * question and the browser only knows one of them.
 */
export async function setDayAvailability(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();

  const techId = String(formData.get("tech_id") ?? "") || session.userId;
  const day = String(formData.get("day") ?? "");
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  const kind = String(formData.get("kind") ?? "shift");
  const note = String(formData.get("note") ?? "").trim();

  if (!day || !from || !to) return { ok: false, error: "Pick a day and both times." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_day_availability", {
    p_tech_id: techId,
    p_day: day,
    p_from: from,
    p_to: to,
    p_kind: kind,
    p_note: note || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return {
    ok: true,
    message:
      kind === "shift" ? "Marked as working." : kind === "break" ? "Break added." : "Time off added.",
  };
}

/** "Actually, I'm not in that day." Clears the whole day for that tech. */
export async function clearDayAvailability(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();

  const techId = String(formData.get("tech_id") ?? "") || session.userId;
  const day = String(formData.get("day") ?? "");
  if (!day) return { ok: false, error: "Pick a day." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_day_availability", {
    p_tech_id: techId,
    p_day: day,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return { ok: true, message: "Day cleared." };
}
