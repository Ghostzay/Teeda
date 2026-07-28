"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";

import { Pressable, motion } from "@/components/motion";
import { useTheme } from "@/components/theme-provider";
import { THEMES, type ModePreference, type ResolvedMode, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * A swatch, not a label.
 *
 * The picker is meant to read like a polish rack: you choose the one you like
 * the look of. Each chip paints the theme's own canvas, its raised surface and
 * its accent using that theme's literal values, so a manager sees the product
 * rather than a word for it.
 */
function Swatch({
  theme,
  mode,
  className,
}: {
  theme: Theme;
  mode: ResolvedMode;
  className?: string;
}) {
  const colors = theme.swatch[mode];

  return (
    <span
      aria-hidden
      className={cn(
        "flex h-14 w-20 shrink-0 items-end gap-1 overflow-hidden rounded-xl border border-subtle p-1.5",
        className,
      )}
      style={{ backgroundColor: colors.canvas }}
    >
      <span className="h-full flex-1 rounded-md" style={{ backgroundColor: colors.raised }} />
      <span className="h-full w-3 rounded-md" style={{ backgroundColor: colors.accent }} />
    </span>
  );
}

/** Both modes of one theme, side by side — the selected theme's full preview. */
export function ThemePreview({ themeId }: { themeId: string }) {
  const theme = THEMES.find((entry) => entry.id === themeId) ?? THEMES[0];

  return (
    <div className="flex flex-wrap gap-4">
      {(["light", "dark"] as const).map((mode) => (
        <div key={mode} className="space-y-1.5">
          <Swatch theme={theme} mode={mode} className="h-20 w-32" />
          <p className="text-meta uppercase text-muted-text">{mode}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * The theme rack. `onPick` lets Settings reuse it for the salon default, where
 * the choice is saved to the salon rather than applied to this device.
 */
export function ThemeRack({
  value,
  onPick,
  columns = "grid-cols-1 sm:grid-cols-2",
}: {
  value?: string;
  onPick?: (id: string) => void;
  columns?: string;
}) {
  const { theme: activeTheme, resolvedMode, setTheme } = useTheme();
  const selected = value ?? activeTheme;

  return (
    <div className={cn("grid gap-3", columns)}>
      {THEMES.map((theme) => {
        const isSelected = theme.id === selected;
        return (
          <Pressable
            key={theme.id}
            onClick={() => (onPick ? onPick(theme.id) : setTheme(theme.id))}
            aria-pressed={isSelected}
            className={cn(
              "relative flex w-full items-center gap-3.5 rounded-2xl border p-3 transition-colors",
              isSelected
                ? "border-accent-default bg-accent-subtle"
                : "border-subtle bg-surface-raised hover:bg-surface-overlay",
            )}
          >
            <Swatch theme={theme} mode={resolvedMode} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold leading-tight">{theme.name}</span>
              <span className="block truncate text-sm text-muted-text">{theme.description}</span>
            </span>
            {isSelected ? (
              <motion.span
                layoutId="theme-selected"
                transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-default text-on-accent"
              >
                <Check className="size-3.5" />
              </motion.span>
            ) : null}
          </Pressable>
        );
      })}
    </div>
  );
}

const MODES: { id: ModePreference; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

/** Light / dark / system. Independent of which theme is chosen. */
export function ModeToggle({ className }: { className?: string }) {
  const { mode, setMode } = useTheme();

  return (
    <div
      role="group"
      aria-label="Appearance mode"
      className={cn("flex gap-1 rounded-xl bg-surface-sunken p-1", className)}
    >
      {MODES.map(({ id, label, icon: Icon }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            aria-pressed={active}
            className={cn(
              "relative flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
              active ? "text-primary-text" : "text-muted-text hover:text-primary-text",
            )}
          >
            {active ? (
              <motion.span
                layoutId="mode-active"
                transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
                className="absolute inset-0 rounded-lg bg-surface-overlay"
              />
            ) : null}
            <Icon className="relative size-4" />
            <span className="relative">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The compact control that lives in the user menu. */
export function AppearanceMenu() {
  const { theme, resolvedMode, setTheme } = useTheme();

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-meta uppercase text-muted-text">Theme</p>
        <div className="flex gap-2">
          {THEMES.map((entry) => {
            const active = entry.id === theme;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTheme(entry.id)}
                aria-pressed={active}
                aria-label={entry.name}
                title={entry.name}
                className={cn(
                  "flex min-h-11 flex-1 flex-col items-center gap-1.5 rounded-xl border p-2 transition-colors",
                  active
                    ? "border-accent-default bg-accent-subtle"
                    : "border-subtle hover:bg-surface-overlay",
                )}
              >
                <Swatch theme={entry} mode={resolvedMode} className="h-9 w-full" />
                <span className="text-meta font-medium">{entry.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-meta uppercase text-muted-text">Mode</p>
        <ModeToggle />
      </div>
    </div>
  );
}
