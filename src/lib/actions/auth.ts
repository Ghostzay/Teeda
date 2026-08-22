"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { MODE_COOKIE, THEME_COOKIE, resolveModePreference, resolveTheme } from "@/lib/theme";
import type { ActionState } from "@/lib/types";


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

/*
 * There is deliberately no signUp here. Salons are provisioned from /admin by
 * the platform; owners arrive by emailed invite; staff are added by their
 * owner. The RPC the old form called now refuses everyone but the platform
 * admin, and RLS refuses the insert underneath that — removing this form is
 * the first layer of three, not the security.
 */

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
