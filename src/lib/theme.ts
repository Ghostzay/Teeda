/**
 * The theme registry.
 *
 * Two independent axes:
 *
 *   theme  the palette and personality  — midnight-plum, noir, …
 *   mode   light | dark | system        — where the device is standing
 *
 * Every theme is authored for both modes. There is no "dark theme"; there is a
 * theme, rendered in a mode.
 *
 * ---------------------------------------------------------------------------
 * Adding a theme
 * ---------------------------------------------------------------------------
 *   1. Add the two CSS blocks in globals.css (see THEME CONTRACT there).
 *   2. Add one entry to THEMES below, with the swatch colours for the picker.
 *
 * That is the whole procedure. No component changes, and no migration — the
 * database stores the name as free text precisely so this stays a two-step job.
 */

export const THEMES = [
  {
    id: "midnight-plum",
    /** Named after the polish, not the palette — the picker is a polish rack. */
    name: "Midnight Plum",
    description: "Deep plum with a saturated magenta finish.",
    /** Swatch previews. Mirrors of the CSS, used only to draw the picker chip. */
    swatch: {
      dark: {
        canvas: "oklch(0.157 0.012 312)",
        raised: "oklch(0.212 0.015 312)",
        accent: "oklch(0.705 0.215 350)",
      },
      light: {
        canvas: "oklch(0.968 0.006 312)",
        raised: "oklch(0.995 0.002 312)",
        accent: "oklch(0.492 0.208 350)",
      },
    },
  },
  {
    id: "noir",
    name: "Noir",
    description: "True neutral greys, one high-contrast finish.",
    swatch: {
      dark: {
        canvas: "oklch(0.145 0 0)",
        raised: "oklch(0.202 0 0)",
        accent: "oklch(0.928 0.014 268)",
      },
      light: {
        canvas: "oklch(0.972 0 0)",
        raised: "oklch(1 0 0)",
        accent: "oklch(0.268 0.012 268)",
      },
    },
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export type Theme = (typeof THEMES)[number];

/** What a user can choose. `system` follows prefers-color-scheme. */
export type ModePreference = "light" | "dark" | "system";
/** What actually gets stamped on <html>. */
export type ResolvedMode = "light" | "dark";

export const DEFAULT_THEME: ThemeId = "midnight-plum";

export const STORAGE_KEY = "teeda-appearance";
export const THEME_COOKIE = "teeda-theme";
export const MODE_COOKIE = "teeda-mode";

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function themeById(id: string | null | undefined): Theme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

/**
 * Resolution order, applied everywhere a theme is needed:
 *
 *   user override → salon default → midnight plum
 *
 * An unrecognised name (a theme that was removed, or one from a newer build)
 * falls through to the next source rather than erroring. That is why the
 * database stores this as free text with no CHECK constraint.
 */
export function resolveTheme(
  userTheme: string | null | undefined,
  salonTheme: string | null | undefined,
): ThemeId {
  if (isThemeId(userTheme)) return userTheme;
  if (isThemeId(salonTheme)) return salonTheme;
  return DEFAULT_THEME;
}

export function resolveModePreference(userMode: string | null | undefined): ModePreference {
  return userMode === "light" || userMode === "dark" ? userMode : "system";
}

/**
 * The blocking script that runs in <head> before first paint.
 *
 * It has to be inline and synchronous: anything deferred paints the wrong
 * theme first and corrects it, which is a flash on every single load.
 *
 * Order of authority, most specific first:
 *   1. localStorage — this device's own choice, written the instant the user
 *      picks, so it is correct before the server has any idea.
 *   2. The attributes the server already rendered from the session's cookies.
 *   3. Midnight plum, with mode from prefers-color-scheme.
 *
 * Written as a string rather than a real function because it must be embedded
 * verbatim; it is inert data, never user input, so dangerouslySetInnerHTML is
 * safe here. Kept small — it is on the critical path of every page load.
 */
export const THEME_SCRIPT = `
(function () {
  try {
    var el = document.documentElement;
    var theme = el.getAttribute('data-theme');
    var mode = null;
    var raw = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
    if (raw) {
      var saved = JSON.parse(raw);
      if (saved.theme) theme = saved.theme;
      if (saved.mode) mode = saved.mode;
    }
    if (!mode || mode === 'system') {
      mode = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    el.setAttribute('data-theme', theme || ${JSON.stringify(DEFAULT_THEME)});
    el.setAttribute('data-mode', mode);
  } catch (e) {
    /* Storage blocked or JSON corrupt: the server-rendered attributes stand. */
  }
})();
`;
