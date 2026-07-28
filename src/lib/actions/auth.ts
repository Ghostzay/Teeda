"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { ensureSalon } from "@/lib/actions/onboarding";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { MODE_COOKIE, THEME_COOKIE, resolveModePreference, resolveTheme } from "@/lib/theme";
import type { ActionState } from "@/lib/types";

/**
 * Draft/staging escape hatch: create salon owners already email-confirmed and
 * sign them straight in, so nobody has to click a link in an inbox to test.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (the auth admin API). Set
 * AUTH_AUTO_CONFIRM=false before going live so real owners verify their email.
 */
const AUTO_CONFIRM =
  process.env.AUTH_AUTO_CONFIRM !== "false" && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!email || !password) {
    return { ok: false, error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { ok: false, error: "That email and password don't match. Try again." };
  }

  // Stamp the appearance cookies now, while we have both the profile and the
  // salon in hand. From here every page is server-rendered already themed, so
  // there is no first-paint flash on this device again — not even the one
  // frame a client-side reconcile would cost.
  await syncAppearanceCookies();

  revalidatePath("/", "layout");
  redirect(next.startsWith("/") ? next : "/");
}

/**
 * Copies the resolved appearance (user override → salon default) into cookies.
 *
 * Cookies rather than a database read per request: the root layout renders
 * above the session and must decide the theme synchronously, and a Supabase
 * round trip on every navigation to pick a colour is not a trade worth making.
 */
export async function syncAppearanceCookies(): Promise<void> {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("theme, mode, salon:salons(default_theme)")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!profile) return;

  const salon = Array.isArray(profile.salon) ? profile.salon[0] : profile.salon;
  const theme = resolveTheme(profile.theme, salon?.default_theme);
  const mode = resolveModePreference(profile.mode);

  const store = await cookies();
  const options = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };
  store.set(THEME_COOKIE, theme, options);
  store.set(MODE_COOKIE, mode, options);
}

/**
 * Creates a salon owner. The `salon_name` / `full_name` metadata is picked up
 * by the `handle_new_user` trigger, which creates the salon and the manager
 * profile — so this works whether or not email confirmation is enabled.
 */
export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const salonName = String(formData.get("salon_name") ?? "").trim();

  // Name the missing field — "all fields are required" is useless on a 4-field form.
  const missing = [
    !salonName && "salon name",
    !fullName && "your name",
    !email && "email",
    !password && "password",
  ].filter(Boolean);

  if (missing.length) {
    return { ok: false, error: `Still needed: ${missing.join(", ")}.` };
  }
  if (password.length < 8) {
    return { ok: false, error: "Use at least 8 characters for your password." };
  }

  const supabase = await createClient();
  const metadata = { full_name: fullName, salon_name: salonName };

  if (AUTO_CONFIRM) {
    // Pre-confirm through the admin API, then sign in normally so the session
    // cookies are set by the SSR client. The handle_new_user trigger creates
    // the salon and manager profile either way.
    const { error: adminError } = await createAdminClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (adminError) {
      return { ok: false, error: adminError.message };
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      return { ok: true, message: "Account created — sign in to continue." };
    }

    // Create the salon here rather than trusting the auth trigger fired.
    const ready = await ensureSalon(salonName, fullName);

    revalidatePath("/", "layout");
    redirect(ready ? "/dashboard" : "/welcome");
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  if (!data.session) {
    return { ok: true, message: "Check your email to confirm your account, then sign in." };
  }

  const ready = await ensureSalon(salonName, fullName);

  revalidatePath("/", "layout");
  redirect(ready ? "/dashboard" : "/welcome");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
