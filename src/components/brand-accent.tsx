import { brandAccentCss, deriveBrandAccent } from "@/lib/brand-color";

/**
 * The salon's colour, applied. Renders one <style> whose selectors
 * (html[data-theme][data-mode]) out-specify the theme blocks, overriding the
 * ACCENT FAMILY only — surfaces, text, borders and status colours stay the
 * platform theme's, which is what keeps a salon's worst colour pick from
 * touching the app's readability. The tokens themselves are derived and
 * AA-clamped in src/lib/brand-color.ts (see scripts/brand-color-test.mjs).
 *
 * No colour, or an invalid one -> renders nothing -> platform default stands.
 */
export function BrandAccent({ color }: { color: string | null | undefined }) {
  const tokens = deriveBrandAccent(color);
  if (!tokens) return null;
  return <style>{brandAccentCss(tokens)}</style>;
}
