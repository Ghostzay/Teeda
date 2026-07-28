"use server";

import { revalidatePath } from "next/cache";

import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

/**
 * Set one tech's commission rate. Manager only — the rate lives in `tech_pay`
 * precisely so it isn't readable from the roster everyone can see.
 *
 * A blank value clears the override and falls back to the salon default.
 */
export async function setCommission(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();

  const techId = String(formData.get("tech_id") ?? "");
  const raw = String(formData.get("commission_percent") ?? "").trim();

  let percent: number | null = null;
  if (raw) {
    percent = Number(raw.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return { ok: false, error: "Enter a rate between 0 and 100." };
    }
    percent = Math.round(percent * 100) / 100;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_commission", {
    p_tech_id: techId,
    p_percent: percent,
    p_note: null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/staff");
  revalidatePath("/earnings");
  revalidatePath("/tech");
  return {
    ok: true,
    message: percent === null ? "Back to the salon default." : `Rate set to ${percent}%.`,
  };
}

