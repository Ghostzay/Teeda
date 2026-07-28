"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

/** Mark everything read, or just the ids given. */
export async function markNotificationsRead(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const ids = formData.getAll("notification_id").map(String).filter(Boolean);
  const supabase = await createClient();

  const { error } = await supabase.rpc("mark_notifications_read", {
    p_ids: ids.length ? ids : null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/tech");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Dismiss a single alert. Cleared alerts are gone, not just marked read. */
export async function dismissNotification(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = String(formData.get("notification_id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("dismiss_notification", { p_id: id });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/tech");
  revalidatePath("/schedule");
  return { ok: true };
}

/** Clear the lot. */
export async function clearNotifications(prev: ActionState): Promise<ActionState> {
  void prev;
  await requireSession();

  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_notifications");

  if (error) return { ok: false, error: error.message };

  revalidatePath("/tech");
  revalidatePath("/schedule");
  return { ok: true, message: "Alerts cleared." };
}
