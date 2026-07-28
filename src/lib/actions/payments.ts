"use server";

import { revalidatePath } from "next/cache";

import { requireFloorAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

/** Money in a form arrives as "65", "65.00" or "$65" — accept all three. */
function parseAmount(raw: FormDataEntryValue | null): number | null {
  const cleaned = String(raw ?? "").replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;

  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;

  return Math.round(value * 100) / 100;
}

/**
 * Record what was collected and close the client out.
 *
 * Front desk only. Nothing here moves money — it records what was taken at
 * the counter, and who the tip belongs to.
 */
export async function recordPayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireFloorAccess();

  const jobId = String(formData.get("job_id") ?? "");
  // Line items the desk rang up, as JSON from the checkout cart.
  const linesRaw = String(formData.get("lines") ?? "");
  const serviceAmount = parseAmount(formData.get("service_amount"));
  const tipAmount = parseAmount(formData.get("tip_amount"));
  const method = String(formData.get("method") ?? "cash");
  const note = String(formData.get("note") ?? "").trim();
  const tipTech = String(formData.get("tip_tech_id") ?? "");

  if (serviceAmount === null || tipAmount === null) {
    return { ok: false, error: "Enter amounts as numbers, e.g. 65 or 65.00." };
  }

  let lines: unknown = null;
  if (linesRaw) {
    try {
      const parsed = JSON.parse(linesRaw);
      if (Array.isArray(parsed) && parsed.length > 0) lines = parsed;
    } catch {
      return { ok: false, error: "Could not read the services on this checkout." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_payment", {
    p_job_id: jobId,
    // When line items are present they define the total; this is the fallback.
    p_service_amount: lines ? null : serviceAmount,
    p_tip_amount: tipAmount,
    p_method: method,
    p_tech_id: tipTech && tipTech !== "default" ? tipTech : null,
    p_note: note || null,
    p_services: lines as never,
    p_split_percent: null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/jobs");
  revalidatePath("/tech");

  const total = (serviceAmount + tipAmount).toFixed(2);
  return { ok: true, message: `Paid — $${total} recorded.` };
}
