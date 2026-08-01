"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";

import { AnimatePresence, motion } from "@/components/motion";
import { AppearanceMenu } from "@/components/theme-picker";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/format";

/**
 * Who is signed in, what the screen looks like, and the way out.
 *
 * Appearance lives here rather than only in Settings because a tech on a
 * shared tablet needs to change it without permission to open Settings at all.
 *
 * There is deliberately no "Start kiosk mode" here. Kiosk mode is something a
 * kiosk account starts on its own sign-in screen, and nothing else can start at
 * all. A control that turns your own account into a locked tablet is a control
 * that locks people out of their own account — one mis-tap from a manager, on a
 * phone with no PIN to hand, and the way back is a support call. Removing it is
 * the feature.
 */
export function UserMenu({
  name,
  role,
  salon,
  signOut,
}: {
  name: string;
  role: string;
  salon: string;
  signOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={container} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex min-h-11 items-center gap-2.5 rounded-xl px-2 transition-colors hover:bg-surface-overlay"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-default text-sm font-semibold text-on-accent">
          {initials(name)}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-sm font-semibold leading-tight">{name}</span>
          <span className="block truncate text-meta text-muted-text">{role}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-text" />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
            className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-72 rounded-2xl border border-default bg-surface-overlay p-3 shadow-lg"
          >
            <div className="mb-3 border-b border-subtle pb-3">
              <p className="truncate font-semibold leading-tight">{name}</p>
              <p className="truncate text-sm text-muted-text">
                {role} · {salon}
              </p>
            </div>

            <AppearanceMenu />

            <form action={signOut} className="mt-3 border-t border-subtle pt-3">
              <Button variant="ghost" type="submit" className="w-full justify-start">
                <LogOut className="size-4" />
                Sign out
              </Button>
            </form>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
