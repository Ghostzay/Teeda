import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Database, Profile, TurnQueueEntry } from "@/lib/types";

type Client = SupabaseClient<Database>;

/**
 * ---------------------------------------------------------------------------
 * Turn management
 * ---------------------------------------------------------------------------
 * Fairness rule, in priority order:
 *
 *   1. A tech who is mid-service is not eligible — you cannot be handed a
 *      client while your hands are busy.
 *   2. Among the free techs, the one whose `last_turn_at` is oldest goes next.
 *      NULL (never taken a turn) sorts first, so new hires get worked in.
 *   3. Ties break on seniority (`created_at`), which is stable and explicable
 *      to the floor — nobody has to trust a random number.
 *
 * The ordering itself lives in SQL (`public.turn_queue`) so that the app, the
 * appointment check-in trigger, and any future integration all rotate
 * identically. `last_turn_at` is advanced by a database trigger the moment a
 * job flips to `in_progress`, so the clock cannot drift even if a row is
 * updated outside the app.
 */

/** The full rotation board, already ordered: whoever is on top is up next. */
export async function getTurnQueue(salonId?: string): Promise<TurnQueueEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("turn_queue", { p_salon_id: salonId ?? null });

  if (error) throw new Error(`Failed to load turn queue: ${error.message}`);
  return data ?? [];
}

/**
 * The tech the system recommends for the next client.
 * Returns null when every tech is busy or the salon has no active techs —
 * the caller should then leave the job unassigned in the waiting queue.
 */
export async function suggestNextTech(salonId?: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("suggest_next_tech", { p_salon_id: salonId ?? null });

  if (error) throw new Error(`Failed to suggest a tech: ${error.message}`);
  return data ?? null;
}

/** Same suggestion, resolved to a name so the UI can explain the choice. */
export async function suggestNextTechDetailed(
  salonId?: string,
): Promise<{ tech: TurnQueueEntry | null; reason: string }> {
  const queue = await getTurnQueue(salonId);
  const free = queue.filter((entry) => !entry.is_busy);

  if (queue.length === 0) {
    return { tech: null, reason: "No active technicians on the roster." };
  }
  if (free.length === 0) {
    return { tech: null, reason: "Every technician is with a client — the job will wait in the queue." };
  }

  const next = free[0];
  const reason = next.last_turn_at
    ? `Free, and waiting the longest since ${formatClock(next.last_turn_at)}.`
    : "Free, and has not taken a turn yet today.";

  return { tech: next, reason };
}

/**
 * Where a given tech sits in the rotation right now.
 * `position` is 1-based across the whole board; `null` when the tech is not on
 * it (inactive, or a manager).
 */
export async function getTurnPosition(
  techId: string,
  salonId?: string,
): Promise<{ position: number | null; total: number; entry: TurnQueueEntry | null }> {
  const queue = await getTurnQueue(salonId);
  const entry = queue.find((row) => row.tech_id === techId) ?? null;

  return {
    position: entry?.queue_position ?? null,
    total: queue.length,
    entry,
  };
}

/**
 * Assign a job to a tech — or pass `null` to return it to the open queue.
 * This is the manager's manual override of the suggestion; the RPC enforces
 * that only managers (or a tech claiming an unassigned job) may call it.
 */
export async function assignJob(jobId: string, techId: string | null, client?: Client) {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.rpc("assign_job", { p_job_id: jobId, p_tech_id: techId });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Start a job. Stamps `started_at`, claims the job for the tech if it was
 * unassigned, and advances that tech's `last_turn_at` — this is the single
 * moment a turn is consumed.
 */
export async function startJob(jobId: string, techId?: string | null, client?: Client) {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.rpc("start_job", {
    p_job_id: jobId,
    p_tech_id: techId ?? null,
  });

  if (error) throw new Error(error.message);
  return data;
}

/** Finish a job, freeing the tech to receive the next turn. */
export async function completeJob(jobId: string, client?: Client) {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.rpc("complete_job", { p_job_id: jobId });

  if (error) throw new Error(error.message);
  return data;
}

/** Manager-only: push a tech to the back of the rotation. */
export async function resetTurn(techId: string, client?: Client) {
  const supabase = client ?? (await createClient());
  const { error } = await supabase.rpc("reset_turn", { p_tech_id: techId });

  if (error) throw new Error(error.message);
}

/**
 * Pure ordering function — the same comparison the SQL uses.
 * Exported so the client can re-sort optimistically after a realtime event
 * without a round trip, and so the rule is unit-testable.
 */
export function compareTurnOrder(
  a: Pick<Profile, "last_turn_at" | "created_at"> & { is_busy?: boolean },
  b: Pick<Profile, "last_turn_at" | "created_at"> & { is_busy?: boolean },
): number {
  const aBusy = a.is_busy ? 1 : 0;
  const bBusy = b.is_busy ? 1 : 0;
  if (aBusy !== bBusy) return aBusy - bBusy;

  // NULL last_turn_at sorts first: never taken a turn = most overdue.
  if (a.last_turn_at === null && b.last_turn_at !== null) return -1;
  if (a.last_turn_at !== null && b.last_turn_at === null) return 1;
  if (a.last_turn_at !== null && b.last_turn_at !== null) {
    const diff = Date.parse(a.last_turn_at) - Date.parse(b.last_turn_at);
    if (diff !== 0) return diff;
  }

  return Date.parse(a.created_at) - Date.parse(b.created_at);
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
