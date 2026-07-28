"use server";

import { revalidatePath } from "next/cache";

import { requireFloorAccess, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

function revalidateRotation() {
  revalidatePath("/tech");
  revalidatePath("/dashboard");
  revalidatePath("/jobs");
  revalidatePath("/settings");
}

function fail(error: unknown): ActionState {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

/**
 * Opt into today's rotation.
 *
 * Being on the roster isn't enough to receive clients — a tech says they're
 * here, each day. Passing a `tech_id` is a front-desk override for someone who
 * forgot or hasn't got their phone out.
 */
export async function checkInForTurns(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  const techId = String(formData.get("tech_id") ?? "") || null;

  if (techId && techId !== session.userId && !session.canManageFloor) {
    return { ok: false, error: "Only the front desk can check someone else in." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("check_in_for_turns", { p_tech_id: techId });

  if (error) return fail(error);

  revalidateRotation();
  return {
    ok: true,
    message: techId && techId !== session.userId ? "Checked in." : "You're on today's rotation.",
  };
}

export async function checkOutOfTurns(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const techId = String(formData.get("tech_id") ?? "") || null;

  if (techId && techId !== session.userId && !session.canManageFloor) {
    return { ok: false, error: "Only the front desk can check someone else out." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("check_out_of_turns", { p_tech_id: techId });

  if (error) return fail(error);

  revalidateRotation();
  return { ok: true, message: "Off the rotation for today." };
}

/** A tech maintains their own skill list from their profile. */
export async function updateMySkills(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();

  const skills = formData.getAll("skills").map(String);
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_my_skills", {
    p_skills: skills as never,
  });

  if (error) return fail(error);

  revalidateRotation();
  return { ok: true, message: "Your services are up to date." };
}

/** Managers can correct anyone's skills from the team roster. */
export async function updateTechSkills(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireFloorAccess();

  const techId = String(formData.get("tech_id") ?? "");
  const skills = formData.getAll("skills").map(String);
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_tech_skills", {
    p_tech_id: techId,
    p_skills: skills as never,
  });

  if (error) return fail(error);

  revalidateRotation();
  return { ok: true, message: "Skills updated." };
}
