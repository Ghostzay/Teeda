import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";
import { requireSupabaseEnv } from "./env";

/**
 * Service-role client. Bypasses RLS — only ever used from server actions that
 * have already verified the caller is a manager of the salon being changed.
 * Currently: creating technician logins via the auth admin API.
 */
export function createAdminClient() {
  const { url } = requireSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — technician accounts cannot be created.",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
