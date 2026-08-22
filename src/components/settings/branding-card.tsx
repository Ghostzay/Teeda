"use client";

import { useState } from "react";
import { Palette } from "lucide-react";

import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateBranding } from "@/lib/actions/branding";

/**
 * The owner's look: logo and one colour. The colour preview is honest about
 * what will happen — the app derives an accessible accent from the pick, so
 * the swatch shows "your colour" and the note says it may be tuned to stay
 * readable. Everything else about the app's look stays the platform's.
 */
export function BrandingCard({
  logoUrl,
  brandColor,
  slug,
}: {
  logoUrl: string | null;
  brandColor: string | null;
  slug: string;
}) {
  const [color, setColor] = useState(brandColor ?? "#c6a56a");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Palette className="size-4 text-accent-default" />
          Your brand
        </CardTitle>
        <CardDescription>
          Shown on your sign-in page at <span className="font-medium">{slug}</span> and as the
          accent colour throughout the app. If a colour is hard to read, it&apos;s adjusted
          just enough to stay legible — same colour, tuned for the screen.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={updateBranding} resetOnSuccess className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="brand_color_picker">Brand colour</Label>
              <div className="flex items-center gap-2">
                <input
                  id="brand_color_picker"
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  className="h-11 w-14 cursor-pointer rounded-lg border border-subtle bg-surface-raised p-1"
                  aria-label="Pick a brand colour"
                />
                <Input
                  name="brand_color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  className="w-32 font-mono"
                  aria-label="Brand colour hex"
                />
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="logo_input">Logo</Label>
              <Input id="logo_input" name="logo" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" />
              <p className="text-meta text-muted-text">PNG, JPG, SVG or WebP, under 1&nbsp;MB.</p>
            </div>
          </div>

          {logoUrl ? (
            <div className="flex items-center gap-3 rounded-xl border border-subtle bg-surface-sunken px-4 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Current logo" className="max-h-12 w-auto max-w-[120px] object-contain" />
              <label className="flex items-center gap-2 text-sm text-secondary-text">
                <input type="checkbox" name="clear_logo" value="true" className="size-4" />
                Remove the logo
              </label>
            </div>
          ) : null}

          <SubmitButton>Save branding</SubmitButton>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
