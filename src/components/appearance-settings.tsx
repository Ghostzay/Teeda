"use client";

import { useState } from "react";

import { ActionForm } from "@/components/action-form";
import { ModeToggle, ThemePreview, ThemeRack } from "@/components/theme-picker";
import { useTheme } from "@/components/theme-provider";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveSalonTheme } from "@/lib/actions/appearance";
import { themeById } from "@/lib/theme";

/**
 * Two separate choices that people conflate, so they are separated on screen:
 *
 *   the salon's theme  what a shared device shows, and the brand
 *   your theme         this device, this person, overriding the salon
 *
 * Mode (light / dark / system) is only ever personal — a salon does not have an
 * opinion about whether the room is bright.
 */
export function AppearanceSettings({ salonTheme }: { salonTheme: string }) {
  const { theme, setTheme } = useTheme();
  const [pendingSalonTheme, setPendingSalonTheme] = useState(salonTheme);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h3 className="font-semibold">Your appearance</h3>
          <p className="text-sm text-muted-text">
            Applies to this device only. Changes take effect immediately.
          </p>
        </div>
        <ThemeRack />
        <ModeToggle />
        <div className="rounded-2xl border border-subtle bg-surface-sunken p-4">
          <p className="mb-3 text-meta uppercase text-muted-text">
            {themeById(theme).name} in both modes
          </p>
          <ThemePreview themeId={theme} />
        </div>
      </section>

      <section className="space-y-3 border-t border-subtle pt-6">
        <div>
          <h3 className="font-semibold">Salon default</h3>
          <p className="text-sm text-muted-text">
            What the mounted front-desk tablet shows, and what anyone who hasn&apos;t chosen for
            themselves gets.
          </p>
        </div>

        <ActionForm action={saveSalonTheme} resetOnSuccess={false} className="space-y-3">
          <input type="hidden" name="theme" value={pendingSalonTheme} />
          <ThemeRack value={pendingSalonTheme} onPick={setPendingSalonTheme} />
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton>Save salon default</SubmitButton>
            {pendingSalonTheme !== theme ? (
              <button
                type="button"
                onClick={() => setTheme(themeById(pendingSalonTheme).id)}
                className="min-h-11 text-sm font-medium text-accent-default underline-offset-4 hover:underline"
              >
                Preview it on this device
              </button>
            ) : null}
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
