"use server";

import { revalidatePath } from "next/cache";

import { requireManager, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

export async function upsertCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  const supabase = await createClient();

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) return { ok: false, error: "A name is required." };

  if (id) {
    const { error } = await supabase
      .from("customers")
      .update({ name, phone: phone || null, notes: notes || null })
      .eq("id", id)
      .eq("salon_id", session.salon.id);

    if (error) return { ok: false, error: error.message };
    revalidatePath("/customers");
    return { ok: true, message: "Customer updated." };
  }

  const { error } = await supabase.from("customers").insert({
    salon_id: session.salon.id,
    name,
    phone: phone || null,
    notes: notes || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/customers");
  revalidatePath("/jobs");
  return { ok: true, message: "Customer added." };
}

export async function deleteCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireManager();
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");

  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", id)
    .eq("salon_id", session.salon.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/customers");
  return { ok: true, message: "Customer removed." };
}
