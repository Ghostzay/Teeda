"use server";

import { revalidatePath } from "next/cache";

import { requireManager, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { assignJob, completeJob, startJob, suggestNextTech } from "@/lib/turn";
import type { ActionState, JobType } from "@/lib/types";

/** Every screen shows some slice of the queue, so refresh them together. */
function revalidateQueue() {
  revalidatePath("/dashboard");
  revalidatePath("/tech");
  revalidatePath("/jobs");
  revalidatePath("/appointments");
}

function fail(error: unknown): ActionState {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

/**
 * Check a client in. If no tech is chosen the rotation picks one, so the
 * fair-turn default applies even when the front desk is in a hurry.
 */
export async function createJob(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  const supabase = await createClient();

  const type = (String(formData.get("type") ?? "walk-in") as JobType) satisfies JobType;
  const serviceName = String(formData.get("service_name") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const photoUrl = String(formData.get("photo_url") ?? "").trim();
  const techChoice = String(formData.get("tech_id") ?? "auto");

  let customerId = String(formData.get("customer_id") ?? "").trim();
  const newCustomerName = String(formData.get("new_customer_name") ?? "").trim();
  const newCustomerPhone = String(formData.get("new_customer_phone") ?? "").trim();

  if (!serviceName) return { ok: false, error: "Pick or type a service." };

  // Walk-ins usually mean a customer record that doesn't exist yet.
  if (!customerId) {
    if (!newCustomerName) return { ok: false, error: "Choose an existing customer or enter a name." };

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({
        salon_id: session.salon.id,
        name: newCustomerName,
        phone: newCustomerPhone || null,
      })
      .select("id")
      .single();

    if (customerError) return fail(customerError);
    customerId = customer.id;
  }

  let techId: string | null = null;
  if (techChoice === "auto") {
    techId = await suggestNextTech(session.salon.id);
  } else if (techChoice !== "unassigned") {
    techId = techChoice;
  }

  const { error } = await supabase.from("jobs").insert({
    salon_id: session.salon.id,
    customer_id: customerId,
    tech_id: techId,
    type,
    status: "waiting",
    service_name: serviceName,
    notes: notes || null,
    photo_url: photoUrl || null,
  });

  if (error) return fail(error);

  revalidateQueue();
  revalidatePath("/customers");
  return { ok: true, message: "Client checked in." };
}

/** Manager override of the suggested tech (or `unassigned` to release a job). */
export async function assignJobAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();

  const jobId = String(formData.get("job_id") ?? "");
  const raw = String(formData.get("tech_id") ?? "");
  const techId = !raw || raw === "unassigned" ? null : raw;

  try {
    await assignJob(jobId, techId);
  } catch (error) {
    return fail(error);
  }

  revalidateQueue();
  return { ok: true, message: techId ? "Job assigned." : "Job returned to the queue." };
}

/** Assign the job to whoever the rotation says is up next. */
export async function assignNextTechAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireManager();
  const jobId = String(formData.get("job_id") ?? "");

  try {
    const techId = await suggestNextTech(session.salon.id);
    if (!techId) {
      return { ok: false, error: "Every tech is busy right now." };
    }
    await assignJob(jobId, techId);
  } catch (error) {
    return fail(error);
  }

  revalidateQueue();
  return { ok: true, message: "Assigned to the next tech in rotation." };
}

/** Start work — this is the action that consumes a turn. */
export async function startJobAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();

  const jobId = String(formData.get("job_id") ?? "");
  const techId = String(formData.get("tech_id") ?? "") || null;

  try {
    await startJob(jobId, techId);
  } catch (error) {
    return fail(error);
  }

  revalidateQueue();
  return { ok: true, message: "Job started." };
}

export async function completeJobAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const jobId = String(formData.get("job_id") ?? "");

  try {
    await completeJob(jobId);
  } catch (error) {
    return fail(error);
  }

  revalidateQueue();
  return { ok: true, message: "Job completed." };
}

export async function cancelJobAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireManager();
  const supabase = await createClient();
  const jobId = String(formData.get("job_id") ?? "");

  const { data: job, error: readError } = await supabase
    .from("jobs")
    .select("appointment_id")
    .eq("id", jobId)
    .maybeSingle();

  if (readError) return fail(readError);

  const { error } = await supabase
    .from("jobs")
    .update({ status: "cancelled" })
    .eq("id", jobId)
    .eq("salon_id", session.salon.id);

  if (error) return fail(error);

  if (job?.appointment_id) {
    await supabase.from("appointments").update({ status: "cancelled" }).eq("id", job.appointment_id);
  }

  revalidateQueue();
  return { ok: true, message: "Job cancelled." };
}
