"use server";

import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ClientSearchRow } from "@/lib/types";

/**
 * Client search, server-side.
 *
 * This is the only way the app looks a client up by name. The full list is
 * never sent to a browser — `getCustomerOptions()` used to ship five hundred
 * rows into the page source of every booking form, which was both slow and a
 * copy of the salon's client list sitting in the DOM.
 */
export async function searchClients(q: string): Promise<ClientSearchRow[]> {
  await requireSession();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("staff_search_clients", { q, lim: 10 });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Today's clients, so an empty search box is not an empty panel. */
export async function recentClients(): Promise<ClientSearchRow[]> {
  await requireSession();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("staff_recent_clients", { lim: 8 });
  if (error) return [];
  return data ?? [];
}
