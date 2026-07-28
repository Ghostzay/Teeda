"use server";

import { revalidatePath } from "next/cache";

import { requireFloorAccess, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { assignJob, completeJob, skipJob, startJob, suggestNextTech } from "@/lib/turn";
import type { ActionState, JobType, Skill } from "@/lib/types";

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
 * Check a walk-in client in. Front desk only — techs never create clients or
 * jobs. If no tech is chosen the rotation picks one, so the fair path is the
 * path of least resistance even when the desk is busy.
 */
export async function createJob(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireFloorAccess();
  const supabase = await createClient();

  const type = (String(formData.get("type") ?? "walk-in") as JobType) satisfies JobType;
  const serviceName = String(formData.get("service_name") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const photoUrl = String(formData.get("photo_url") ?? "").trim();
  const techChoice = String(formData.get("tech_id") ?? "auto");
  const serviceId = String(formData.get("service_id") ?? "").trim();

  let customerId = String(formData.get("customer_id") ?? "").trim();
  const newCustomerName = String(formData.get("new_customer_name") ?? "").trim();
  const newCustomerPhone = String(formData.get("new_customer_phone") ?? "").trim();

  if (!serviceName) return { ok: false, error: "Pick or type a service." };

  // Walk-ins usually mean a customer record that doesn't exist yet.
  if (!customerId) {
    if (!newCustomerName) return { ok: false, error: "Choose an existing client or enter a name." };

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

  // A menu service brings its required skills, so the rotation only offers
  // this client to a tech who actually does the work.
  let requiredSkills: Skill[] = [];
  let servicePrice: number | null = null;

  if (serviceId) {
    const { data: service } = await supabase
      .from("services")
      .select("required_skills, price")
      .eq("id", serviceId)
      .maybeSingle();

    if (service) {
      requiredSkills = service.required_skills;
      servicePrice = Number(service.price);
    }
  }

  let techId: string | null = null;
  if (techChoice === "auto") {
    techId = await suggestNextTech(session.salon.id, requiredSkills);
  } else if (techChoice !== "unassigned") {
    techId = techChoice;
  }

  const { data: job, error } = await supabase
    .from("jobs")
    .insert({
      salon_id: session.salon.id,
      customer_id: customerId,
      tech_id: techId,
      service_id: serviceId || null,
      required_skills: requiredSkills,
      type,
      status: "waiting",
      service_name: serviceName,
      notes: notes || null,
      photo_url: photoUrl || null,
    })
    .select("id")
    .single();

  if (error) return fail(error);

  // Seed the checkout line item so the desk isn't re-picking at payment time.
  if (job && serviceId && servicePrice !== null) {
    await supabase.from("job_services").insert({
      salon_id: session.salon.id,
      job_id: job.id,
      service_id: serviceId,
      name: serviceName,
      price: servicePrice,
    });
  }

  revalidateQueue();
  revalidatePath("/customers");
  return { ok: true, message: "Checked in — they're in the queue." };
}

/** Front-desk override of the suggested tech (or `unassigned` to release it). */
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
  return { ok: true, message: techId ? "Assigned." : "Back in the open queue." };
}

/** Hand the client to whoever the rotation says is up next. */
export async function assignNextTechAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireFloorAccess();
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
  return { ok: true, message: "Given to the next tech in rotation." };
}

/**
 * Accept the client and start the service — the action that consumes a turn.
 */
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
  return { ok: true, message: "Started — the client is yours." };
}

/**
 * Pass on a client. Costs the tech their place in the rotation and offers the
 * client to whoever is next.
 */
export async function skipJobAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();
  const jobId = String(formData.get("job_id") ?? "");

  try {
    await skipJob(jobId);
  } catch (error) {
    return fail(error);
  }

  revalidateQueue();
  return { ok: true, message: "Passed on — you've moved to the back of the rotation." };
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
  return { ok: true, message: "Finished." };
}

export async function cancelJobAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireFloorAccess();
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
  return { ok: true, message: "Cancelled." };
}
