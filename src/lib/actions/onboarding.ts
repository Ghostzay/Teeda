"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAuthUser, getSessionContext } from "@/lib/auth";
import { describeSetupError } from "@/lib/setup-error";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

/**
 * Creates the salon and makes the caller its manager.
 *
 * Idempotent, and independent of the `auth.users` trigger — this is what
 * guarantees a new owner lands in a working console even if that trigger was
 * never attached (it needs privileges the SQL editor doesn't always have).
 */
export async function bootstrapSalon(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const salonName = String(formData.get("salon_name") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!salonName) return { ok: false, error: "Give your salon a name." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("bootstrap_salon", {
    p_salon_name: salonName,
    p_full_name: fullName || null,
  });

  if (error) return { ok: false, error: describeSetupError(error) };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/**
 * Best-effort bootstrap used right after signup, where the salon name is
 * already known. Returns true once the caller has a readable salon.
 */
export async function ensureSalon(salonName: string, fullName: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("bootstrap_salon", {
    p_salon_name: salonName,
    p_full_name: fullName || null,
  });

  if (error) return false;

  // Confirm the profile is actually readable before routing them onward.
  return Boolean(await getSessionContext());
}
