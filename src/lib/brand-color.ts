/**
 * From one owner-picked hex to an accent that passes AA — in both modes.
 *
 * The owner picks the colour; this module keeps the app readable when they
 * pick a bad one, which they will. Sunflower yellow, neon green, near-black,
 * near-white: every input yields an accent family that meets the same
 * contract the built-in themes are audited against:
 *
 *   accent-default vs canvas & raised        >= 4.5   (accents carry text)
 *   on-accent      vs accent-default         >= 4.5
 *   accent-default vs accent-subtle-bg       >= 4.5
 *   accent-hover   vs canvas                 >= 3
 *
 * Method: keep the picked HUE (that is the brand), cap chroma at a sane
 * maximum, then binary-search LIGHTNESS in OKLCH until the contrast holds —
 * lighter until it clears ink in dark mode, darker until it clears paper in
 * light mode. Perceptually the result is "their colour, adjusted to read",
 * which is what a brand system means by an accessible accent.
 *
 * ONLY the accent family is derived. Surfaces, text, borders and status
 * colours stay the platform theme's — a salon brands the action colour, not
 * the readability of the whole app.
 */

export type BrandAccentTokens = {
  dark: Record<string, string>;
  light: Record<string, string>;
};

/* ---------------------------------------------------------------- colour math
   Same OKLab math as scripts/contrast-audit.mjs, so what this module promises
   is what that audit measures. */

type Oklch = { l: number; c: number; h: number };

export function hexToOklch(hex: string): Oklch | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const lin = (v: number) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s;
  const c = Math.hypot(A, B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

function oklchToLinearSrgb({ l, c, h }: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

/** WCAG relative luminance, with the browser's gamut clip applied first. */
function luminance(color: Oklch): number {
  const clip = (v: number) => Math.min(1, Math.max(0, v));
  const [r, g, b] = oklchToLinearSrgb(color).map(clip);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: Oklch, b: Oklch): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const css = ({ l, c, h }: Oklch) =>
  `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;

/* ------------------------------------------------------------- the derivation
   The anchors the accent must read against: the Zolvora theme's canvases.
   Derivation targets the DEFAULT theme's surfaces; noir's are close enough
   (its canvases are within 0.05 L of these) that the clamp margin covers it. */

const DARK_CANVAS: Oklch = { l: 0.197, c: 0.01, h: 277 };
const DARK_RAISED: Oklch = { l: 0.232, c: 0.01, h: 277 };
const LIGHT_CANVAS: Oklch = { l: 0.966, c: 0.008, h: 85 };
const LIGHT_RAISED: Oklch = { l: 0.992, c: 0.004, h: 85 };

const MAX_CHROMA = 0.23;
/** A little above 4.5, so rounding in oklch() serialization can't tip a pair under. */
const AA = 4.6;

/**
 * Binary-search lightness in `direction` until `test` passes against both
 * backgrounds. Falls back to the extreme if the hue simply cannot get there
 * (it always can — white and black both pass everything at the ends).
 */
function solveLightness(
  base: Oklch,
  backgrounds: Oklch[],
  direction: "lighter" | "darker",
): Oklch {
  const passes = (l: number) => {
    // Chroma shrinks as lightness leaves the gamut's belly; scale it down so
    // extreme lightness doesn't produce an out-of-gamut colour that clips to
    // something unpredictable.
    const c = Math.min(base.c, MAX_CHROMA) * (1 - Math.abs(l - 0.6) * 0.8);
    const candidate = { l, c: Math.max(0.02, c), h: base.h };
    return backgrounds.every((bg) => contrast(candidate, bg) >= AA) ? candidate : null;
  };

  let lo = direction === "lighter" ? base.l : 0.05;
  let hi = direction === "lighter" ? 0.99 : base.l;

  // If even the extreme fails, the base is on the wrong side entirely; search
  // the full range instead of giving up.
  if (direction === "lighter" && !passes(hi)) return { l: 0.99, c: 0.02, h: base.h };
  if (direction === "darker" && !passes(lo)) return { l: 0.05, c: 0.02, h: base.h };

  // Find the closest passing lightness to the base value.
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (direction === "lighter") {
      if (passes(mid)) hi = mid;
      else lo = mid;
    } else {
      if (passes(mid)) lo = mid;
      else hi = mid;
    }
  }
  return passes(direction === "lighter" ? hi : lo)!;
}

/**
 * The whole family, both modes, from one hex. Null when the hex is invalid —
 * callers render the platform accent, never a guess.
 */
export function deriveBrandAccent(hex: string | null | undefined): BrandAccentTokens | null {
  const base = hex ? hexToOklch(hex) : null;
  if (!base) return null;

  // DARK: the accent must read on ink, and ink must read on the accent.
  const dark = solveLightness(base, [DARK_CANVAS, DARK_RAISED], "lighter");
  const darkHover = { ...dark, l: Math.min(0.99, dark.l + 0.05) };
  // Subtle fill: same hue, deep and quiet; accent text sits on it, so push it
  // down until that pair clears AA too.
  let darkSubtle: Oklch = { l: 0.32, c: Math.min(base.c * 0.5, 0.06), h: base.h };
  while (contrast(dark, darkSubtle) < AA && darkSubtle.l > 0.06) {
    darkSubtle = { ...darkSubtle, l: darkSubtle.l - 0.02 };
  }

  // LIGHT: the same brand, driven dark enough to read on paper.
  const light = solveLightness(base, [LIGHT_CANVAS, LIGHT_RAISED], "darker");
  const lightHover = { ...light, l: Math.max(0.05, light.l - 0.06) };
  let lightSubtle: Oklch = { l: 0.955, c: Math.min(base.c * 0.35, 0.035), h: base.h };
  while (contrast(light, lightSubtle) < AA && lightSubtle.l < 0.995) {
    lightSubtle = { ...lightSubtle, l: lightSubtle.l + 0.01 };
  }

  return {
    dark: {
      "--accent-default": css(dark),
      "--accent-hover": css(darkHover),
      "--accent-subtle-bg": css(darkSubtle),
      "--accent-on-accent": css(DARK_CANVAS),
      "--text-on-accent": css(DARK_CANVAS),
      "--ring": css(dark),
    },
    light: {
      "--accent-default": css(light),
      "--accent-hover": css(lightHover),
      "--accent-subtle-bg": css(lightSubtle),
      "--accent-on-accent": css(LIGHT_RAISED),
      "--text-on-accent": css(LIGHT_RAISED),
      "--ring": css(light),
    },
  };
}

/**
 * The tokens as a stylesheet. `html[data-theme][data-mode]` out-specifies the
 * theme blocks' `[data-theme="x"][data-mode="y"]`, so the derived accent wins
 * over whichever theme is active — and ONLY the accent: everything else still
 * comes from the theme.
 */
export function brandAccentCss(tokens: BrandAccentTokens): string {
  const block = (vars: Record<string, string>) =>
    Object.entries(vars)
      .map(([k, v]) => `${k}:${v};`)
      .join("");
  return (
    `html[data-theme][data-mode="dark"]{${block(tokens.dark)}}` +
    `html[data-theme][data-mode="light"]{${block(tokens.light)}}`
  );
}
