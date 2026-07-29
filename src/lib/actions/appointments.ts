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
  const serviceIds = formData.getAll("service_ids").map(String).filter(Boolean);

  let customerId = String(formData.get("customer_id") ?? "").trim();
  const newCustomerName = String(formData.get("new_customer_name") ?? "").trim();
  const newCustomerPhone = String(formData.get("new_customer_phone") ?? "").trim();

  if (!serviceName && serviceIds.length === 0) {
    return { ok: false, error: "Pick or type a service." };
  }
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

  // The booking and its basket go in together — a booking that saved without
  // its lines shows the right name and quotes the wrong price at checkout. The
  // RPC also refuses a requested tech who cannot do everything in the basket,
  // which is a mistake far cheaper to catch now than at check-in.
  const { error } = await supabase.rpc("book_appointment", {
    p_customer_id: customerId,
    p_scheduled_at: scheduledAt.toISOString(),
    p_service_ids: serviceIds,
    p_service_name: serviceName || null,
    p_tech_id: techChoice && techChoice !== "any" ? techChoice : null,
    p_notes: notes || null,
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

/**
 * Change a booking after it has been made.
 *
 * Previously there was create and cancel and nothing between, so a mistyped
 * time meant cancelling and rebooking — which loses the thread for the client
 * and leaves a cancelled row behind.
 *
 * An empty field means "leave it alone" rather than "clear it", except for the
 * tech, where clearing is a real intent and gets its own flag.
 */
export async function updateAppointmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireFloorAccess();

  const id = String(formData.get("appointment_id") ?? "");
  if (!id) return { ok: false, error: "Which booking?" };

  const date = String(formData.get("date") ?? "").trim();
  const time = String(formData.get("time") ?? "").trim();
  const techRaw = String(formData.get("tech_id") ?? "");
  const serviceIds = formData.getAll("service_ids").map(String).filter(Boolean);
  const customerId = String(formData.get("customer_id") ?? "").trim();
  const notes = String(formData.get("notes") ?? "");

  let scheduledAt: string | null = null;
  if (date && time) {
    const when = new Date(`${date}T${time}`);
    if (Number.isNaN(when.getTime())) return { ok: false, error: "That date and time don't parse." };
    scheduledAt = when.toISOString();
  }

  const supabase = await createClient();

  // The basket first: `set_appointment_services` rewrites `service_id` and the
  // one-line label from the lines, so running it after `update_appointment`
  // would overwrite whatever that just set.
  //
  // An empty list means "the desk cleared every line", which the sheet only
  // sends once it has read the saved basket back — so it is a real intent,
  // not a form that posted before it finished loading.
  if (serviceIds.length > 0) {
    const { error: basketError } = await supabase.rpc("set_appointment_services", {
      p_appointment_id: id,
      p_service_ids: serviceIds,
    });
    if (basketError) return { ok: false, error: basketError.message };
  }

  const { error } = await supabase.rpc("update_appointment", {
    p_id: id,
    p_scheduled_at: scheduledAt,
    p_tech_id: techRaw && techRaw !== "unassigned" ? techRaw : null,
    // The basket owns the service now; passing it again here would fight it.
    p_service_id: null,
    p_customer_id: customerId || null,
    p_notes: notes,
    p_clear_tech: techRaw === "unassigned",
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/appointments");
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return { ok: true, message: "Booking updated." };
}
