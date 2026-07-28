"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

function revalidateSchedule() {
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard");
  revalidatePath("/tech");
  revalidatePath("/appointments");
}

/**
 * Hold time out of a tech's day — a break, or hours they aren't available.
 *
 * The database refuses anything that overlaps an existing block once the
 * 5-minute buffers are applied, so a clash surfaces here as a plain message
 * rather than a silent double-booking.
 */
export async function blockTime(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();

  const techId = String(formData.get("tech_id") ?? "") || session.userId;
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = String(formData.get("end_time") ?? "");
  const kind = String(formData.get("kind") ?? "break");
  const title = String(formData.get("title") ?? "").trim();

  if (!date || !startTime || !endTime) {
    return { ok: false, error: "Pick a date and a start and end time." };
  }

  // The times entered are the salon's wall clock.
  const startsAt = new Date(`${date}T${startTime}`);
  const endsAt = new Date(`${date}T${endTime}`);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { ok: false, error: "That date and time isn't valid." };
  }
  if (endsAt <= startsAt) {
    return { ok: false, error: "The end time has to be after the start time." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("block_time", {
    p_tech_id: techId,
    p_starts_at: startsAt.toISOString(),
    p_ends_at: endsAt.toISOString(),
    p_kind: kind,
    p_title: title || null,
    p_buffer: 5,
  });

  if (error) return { ok: false, error: error.message };

  revalidateSchedule();
  return { ok: true, message: "Time blocked out." };
}

/** Free a block up again. Appointment blocks are released by cancelling the booking. */
export async function unblockTime(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();
  const id = String(formData.get("block_id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("unblock_time", { p_id: id });

  if (error) return { ok: false, error: error.message };

  revalidateSchedule();
  return { ok: true, message: "Slot freed up." };
}
