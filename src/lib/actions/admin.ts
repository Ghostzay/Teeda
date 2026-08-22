"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionState } from "@/lib/types";

/**
 * The platform console's verbs.
 *
 * Every action here re-checks the platform role server-side and then calls a
 * SECURITY DEFINER RPC that checks it AGAIN in SQL and writes the audit row.
 * The RPC's check is the one that counts; this layer exists so an unauthorized
 * caller is turned away before any service-role client is even constructed.
 *
 * The service key appears in exactly one action — the owner invite — because
 * creating an auth user is an auth-admin operation, not a database row.
 */

export type SalonHealth = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  suspended_at: string | null;
  staff: number;
  last_activity: string | null;
};

export async function adminListSalons(): Promise<SalonHealth[]> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_salons");
  return (data ?? []) as SalonHealth[];
}

/**
 * Create a salon and invite its first owner, by email.
 *
 * The invite comes from Supabase's admin API: the owner sets their own
 * password from the emailed link, and no password ever exists on this side.
 * When SMTP is not configured (local, staging), the generated action link is
 * returned so the platform admin can hand it over out-of-band — visibly
 * second-best, never silent.
 */
export async function adminCreateSalon(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSuperAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const ownerEmail = String(formData.get("owner_email") ?? "").trim().toLowerCase();
  const ownerName = String(formData.get("owner_name") ?? "").trim();

  if (!name) return { ok: false, error: "The salon needs a name." };
  if (!ownerEmail) return { ok: false, error: "The owner needs an email — they arrive by invite." };
  if (slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return { ok: false, error: "Slug: lowercase letters, digits and single hyphens only." };
  }

  const supabase = await createClient();
  const { data: created, error } = await supabase.rpc("admin_create_salon", {
    p_name: name,
    p_slug: slug || null,
  });
  if (error) return { ok: false, error: error.message };

  const salon = created as { id: string; name: string; slug: string };

  // The invite. Failure here must not strand a half-made salon silently: the
  // salon exists (that part succeeded and is audited), so report exactly what
  // is left to do.
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return {
      ok: true,
      message: `${salon.name} created at ${salon.slug} — but no service key is configured, so no owner was invited. Add SUPABASE_SERVICE_ROLE_KEY and invite them again.`,
    };
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    ownerEmail,
    { data: { full_name: ownerName } },
  );

  let ownerId = invited?.user?.id ?? null;
  let inviteNote = "an invite email is on its way to them.";

  if (inviteError) {
    // Most common: SMTP not configured, or the user already exists. Fall back
    // to a link the admin can copy, or to attaching the existing account.
    const { data: linkData } = await admin.auth.admin.generateLink({
      type: "invite",
      email: ownerEmail,
      options: { data: { full_name: ownerName } },
    });
    ownerId = linkData?.user?.id ?? ownerId;
    inviteNote = linkData?.properties?.action_link
      ? `email delivery failed, so hand them this link instead: ${linkData.properties.action_link}`
      : `the invite failed (${inviteError.message}) — fix email delivery and invite them again.`;
  }

  if (ownerId) {
    const { error: attachError } = await supabase.rpc("admin_attach_owner", {
      p_salon: salon.id,
      p_user: ownerId,
      p_full_name: ownerName || ownerEmail.split("@")[0],
    });
    if (attachError) {
      return {
        ok: false,
        error: `${salon.name} exists and ${ownerEmail} was invited, but attaching them as owner failed: ${attachError.message}`,
      };
    }
  }

  revalidatePath("/admin");
  return { ok: true, message: `${salon.name} created at ${salon.slug} — ${inviteNote}` };
}

export async function adminSetSuspended(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSuperAdmin();
  const salonId = String(formData.get("salon_id") ?? "");
  const suspend = String(formData.get("suspend") ?? "") === "true";

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_salon_suspended", {
    p_salon: salonId,
    p_suspended: suspend,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  return { ok: true, message: suspend ? "Salon suspended. Data retained." : "Salon reactivated." };
}

/** Enter the support view. Lands on the salon's dashboard, wearing the banner. */
export async function adminImpersonate(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const salonId = String(formData.get("salon_id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_impersonate", { p_salon: salonId });
  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function adminStopImpersonation(): Promise<void> {
  // Deliberately NOT requireSuperAdmin: getting OUT of the support view must
  // never be the thing a guard blocks. The RPC deletes only the caller's row.
  const supabase = await createClient();
  await supabase.rpc("admin_stop_impersonation");
  revalidatePath("/", "layout");
  redirect("/admin");
}
