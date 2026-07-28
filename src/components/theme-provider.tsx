"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { saveAppearance } from "@/lib/actions/appearance";
import {
  DEFAULT_THEME,
  MODE_COOKIE,
  STORAGE_KEY,
  THEME_COOKIE,
  isThemeId,
  type ModePreference,
  type ResolvedMode,
  type ThemeId,
} from "@/lib/theme";

type ThemeContextValue = {
  theme: ThemeId;
  /** What the user asked for, which may be "system". */
  mode: ModePreference;
  /** What is actually painted right now. */
  resolvedMode: ResolvedMode;
  setTheme: (theme: ThemeId) => void;
  setMode: (mode: ModePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>");
  return value;
}

function systemMode(): ResolvedMode {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** A year is long enough that the mounted tablet never re-flashes. */
function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Owns the two appearance axes and keeps four things in step:
 *
 *   the DOM attributes   so CSS applies instantly, with no reload
 *   localStorage         so the blocking script gets it right before paint
 *   cookies              so the *server* renders the right attributes too,
 *                        which is what removes the flash on a cold load
 *   Supabase             the durable record, and how a preference follows a
 *                        user to another device
 *
 * The first three are synchronous; the database write is fire-and-forget. A
 * failed write must never block or revert a theme switch — worst case the
 * choice lives on this device only.
 */
export function ThemeProvider({
  children,
  initialTheme,
  initialMode,
}: {
  children: React.ReactNode;
  initialTheme: ThemeId;
  initialMode: ModePreference;
}) {
  const [theme, setThemeState] = useState<ThemeId>(initialTheme);
  const [mode, setModeState] = useState<ModePreference>(initialMode);
  const [resolvedMode, setResolvedMode] = useState<ResolvedMode>(
    initialMode === "system" ? "dark" : initialMode,
  );

  // Read the real system preference once mounted. Before this the server's
  // guess stands, which the blocking script has already corrected in the DOM.
  useEffect(() => {
    if (mode !== "system") {
      setResolvedMode(mode);
      return;
    }

    const query = window.matchMedia("(prefers-color-scheme: light)");
    const sync = () => setResolvedMode(query.matches ? "light" : "dark");
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [mode]);

  // Stamp the DOM. A short cross-fade class is added around the change so a
  // switch reads as a transition rather than a strobe, then removed so it
  // doesn't make every ordinary hover feel laggy.
  useEffect(() => {
    const el = document.documentElement;
    const changed =
      el.getAttribute("data-theme") !== theme || el.getAttribute("data-mode") !== resolvedMode;

    if (changed) el.classList.add("theme-transition");
    el.setAttribute("data-theme", theme);
    el.setAttribute("data-mode", resolvedMode);

    if (!changed) return;
    const timer = window.setTimeout(() => el.classList.remove("theme-transition"), 260);
    return () => window.clearTimeout(timer);
  }, [theme, resolvedMode]);

  const persist = useCallback((nextTheme: ThemeId, nextMode: ModePreference) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: nextTheme, mode: nextMode }));
    } catch {
      // Private mode or storage disabled: cookies still cover the server render.
    }
    writeCookie(THEME_COOKIE, nextTheme);
    writeCookie(MODE_COOKIE, nextMode);
    void saveAppearance(nextTheme, nextMode === "system" ? null : nextMode);
  }, []);

  const setTheme = useCallback(
    (next: ThemeId) => {
      if (!isThemeId(next)) return;
      setThemeState(next);
      persist(next, mode);
    },
    [mode, persist],
  );

  const setMode = useCallback(
    (next: ModePreference) => {
      setModeState(next);
      setResolvedMode(next === "system" ? systemMode() : next);
      persist(theme, next);
    },
    [theme, persist],
  );

  const value = useMemo(
    () => ({ theme, mode, resolvedMode, setTheme, setMode }),
    [theme, mode, resolvedMode, setTheme, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export { DEFAULT_THEME };
