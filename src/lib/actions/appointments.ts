"use server";

import { revalidatePath } from "next/cache";

import { requireFloorAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

export async function createAppointment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireFloorAccess();
  const supabase = await createClient();

  const serviceName = String(formData.get("service_name") ?? "").trim();
  const scheduledDate = String(formData.get("scheduled_date") ?? "");
  const scheduledTime = String(formData.get("scheduled_time") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const techChoice = String(formData.get("tech_id") ?? "");

  let customerId = String(formData.get("customer_id") ?? "").trim();
  const newCustomerName = String(formData.get("new_customer_name") ?? "").trim();
  const newCustomerPhone = String(formData.get("new_customer_phone") ?? "").trim();

  if (!serviceName) return { ok: false, error: "Pick or type a service." };
  if (!scheduledDate || !scheduledTime) return { ok: false, error: "Pick a date and time." };

  // `datetime-local` semantics: the entered wall-clock time is the salon's time.
  const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`);
  if (Number.isNaN(scheduledAt.getTime())) {
    return { ok: false, error: "That date and time isn't valid." };
  }

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

    if (customerError) return { ok: false, error: customerError.message };
    customerId = customer.id;
  }

  const { error } = await supabase.from("appointments").insert({
    salon_id: session.salon.id,
    customer_id: customerId,
    tech_id: techChoice && techChoice !== "any" ? techChoice : null,
    scheduled_at: scheduledAt.toISOString(),
    service_name: serviceName,
    notes: notes || null,
    status: "scheduled",
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/appointments");
  revalidatePath("/dashboard");
  return { ok: true, message: "Appointment booked." };
}

/**
 * Check in an appointment: creates the waiting job that enters the rotation.
 * If the appointment has no requested tech, the turn logic picks one.
 */
export async function checkInAppointment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireFloorAccess();
  const supabase = await createClient();
  const id = String(formData.get("appointment_id") ?? "");

  const { error } = await supabase.rpc("check_in_appointment", { p_appointment_id: id });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/appointments");
  revalidatePath("/dashboard");
  revalidatePath("/jobs");
  revalidatePath("/tech");
  return { ok: true, message: "Checked in — the client is in the queue." };
}

export async function cancelAppointment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireFloorAccess();
  const supabase = await createClient();
  const id = String(formData.get("appointment_id") ?? "");

  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("salon_id", session.salon.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/appointments");
  revalidatePath("/dashboard");
  return { ok: true, message: "Appointment cancelled." };
}
