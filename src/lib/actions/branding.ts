"use server";

import { revalidatePath } from "next/cache";

import { requireManager } from "@/lib/auth";
import { deriveBrandAccent } from "@/lib/brand-color";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

/**
 * The owner's branding: logo and colour. RLS ("managers can update their
 * salon") scopes the write; the guard trigger keeps slug / suspension /
 * powered_by out of reach even here. The colour is validated by actually
 * DERIVING from it — if the derivation can't use it, it doesn't get stored.
 */
export async function updateBranding(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireManager();
  const supabase = await createClient();

  const rawColor = String(formData.get("brand_color") ?? "").trim().toLowerCase();
  const clearColor = String(formData.get("clear_color") ?? "") === "true";
  const clearLogo = String(formData.get("clear_logo") ?? "") === "true";

  const update: { brand_color?: string | null; logo_url?: string | null } = {};

  if (clearColor) {
    update.brand_color = null;
  } else if (rawColor) {
    if (!deriveBrandAccent(rawColor)) {
      return { ok: false, error: "That colour didn't parse — use a 6-digit hex like #b76e79." };
    }
    update.brand_color = rawColor;
  }

  if (clearLogo) {
    update.logo_url = null;
  } else {
    const file = formData.get("logo");
    if (file instanceof File && file.size > 0) {
      if (file.size > 1_000_000) {
        return { ok: false, error: "Keep the logo under 1 MB — it loads on every visit." };
      }
      if (!/^image\/(png|jpe?g|svg\+xml|webp)$/.test(file.type)) {
        return { ok: false, error: "PNG, JPG, SVG or WebP." };
      }
      // One well-known path per salon: re-uploading replaces, storage never
      // accumulates, and the RLS policy scopes writes to this exact folder.
      const extension = file.type === "image/svg+xml" ? "svg" : file.type.replace("image/", "").replace("jpeg", "jpg");
      const path = `${session.salon.id}/logo.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("branding")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) {
        return { ok: false, error: `Upload failed: ${uploadError.message}` };
      }
      const { data: publicUrl } = supabase.storage.from("branding").getPublicUrl(path);
      // Cache-bust: same path every time, so the URL must carry the version.
      update.logo_url = `${publicUrl.publicUrl}?v=${Date.now()}`;
    }
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, error: "Nothing to save yet — pick a colour or a logo." };
  }

  const { error } = await supabase.from("salons").update(update).eq("id", session.salon.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, message: "Branding saved. Your sign-in page and accent colour follow it." };
}
