"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion, motion } from "framer-motion";

import { ZolvoraLogo } from "@/components/brand";
import { EASE } from "@/components/motion";
import { ENTRY_COOKIE } from "@/lib/entry";

/**
 * The entry sequence: the mark resolves into the header, once a day.
 *
 * ---------------------------------------------------------------------------
 * When it plays
 * ---------------------------------------------------------------------------
 * The SERVER decides, by comparing the `zolvora_entry_seen` cookie
 * (`userId.dayKey`) against the session and the salon's own calendar day. That
 * is what makes it per-user on a shared tablet — a tech who logs in eight
 * times a shift sees it once, and the next tech to log in sees their own —
 * and it means the overlay is in the server-rendered HTML, so there is no
 * flash of dashboard before it. The client only ever *finishes* the sequence.
 *
 * ---------------------------------------------------------------------------
 * The hard requirements, and where each is enforced
 * ---------------------------------------------------------------------------
 *   under 1.2s      the timeline below sums to ~1.05s, and a 1.4s watchdog
 *                   hard-finishes if anything stalls
 *   skippable       any pointer or key press finishes it instantly
 *   reduced motion  a CSS media rule removes the overlay before first paint
 *                   (no JS involved), and the effect stamps it as seen
 *   never blocks    the app below is fully rendered and the overlay's own tap
 *                   IS the skip — there is no moment where a tap does nothing
 *
 * The flight targets the real header tile (`[data-brand-tile]`), measured at
 * animation time, so the mark lands exactly where the brand lives — at any
 * viewport width, or fades in place if the tile isn't on screen.
 */
export function EntryReveal({
  play,
  userId,
  dayKey,
  children,
}: {
  play: boolean;
  userId: string;
  dayKey: string;
  children: React.ReactNode;
}) {
  return (
    <>
      {play ? <EntryOverlay userId={userId} dayKey={dayKey} /> : null}
      {children}
    </>
  );
}

/** How long the mark holds centre stage before flying to the header. */
const FLY_AT_MS = 450;
const FLY_S = 0.38;
const FADE_S = 0.24;

type Phase = "in" | "fly" | "done";

function EntryOverlay({ userId, dayKey }: { userId: string; dayKey: string }) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("in");
  const [flight, setFlight] = useState<{ x: number; y: number; scale: number } | null>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const stamped = useRef(false);

  const stamp = useCallback(() => {
    if (stamped.current) return;
    stamped.current = true;
    // A year of Max-Age and the day in the value: tomorrow the value no longer
    // matches, which is exactly the "plays once per day" rule with no expiry
    // arithmetic to get wrong.
    document.cookie = `${ENTRY_COOKIE}=${userId}.${dayKey}; path=/; max-age=31536000; samesite=lax`;
  }, [userId, dayKey]);

  const finish = useCallback(() => {
    stamp();
    setPhase("done");
  }, [stamp]);

  // Reduced motion: the overlay is already display:none via CSS before first
  // paint; this just records "seen" and removes it from the tree.
  useEffect(() => {
    if (reduce) finish();
  }, [reduce, finish]);

  // The watchdog. If framer stalls, a tab was backgrounded mid-flight, or an
  // exit animation never fires its callback, the overlay still leaves.
  useEffect(() => {
    const timer = setTimeout(finish, 1400);
    return () => clearTimeout(timer);
  }, [finish]);

  // Skip on any key, anywhere. (Pointer skip is the overlay's own handler.)
  useEffect(() => {
    window.addEventListener("keydown", finish);
    return () => window.removeEventListener("keydown", finish);
  }, [finish]);

  const startFlight = useCallback(() => {
    if (stamped.current) return;
    const logo = logoRef.current?.getBoundingClientRect();
    const tile = document.querySelector("[data-brand-tile]")?.getBoundingClientRect();
    if (logo && tile && tile.width > 0) {
      setFlight({
        x: tile.left + tile.width / 2 - (logo.left + logo.width / 2),
        y: tile.top + tile.height / 2 - (logo.top + logo.height / 2),
        scale: tile.width / logo.width,
      });
    }
    setPhase("fly");
  }, []);

  // The flight is scheduled from hydration, not chained off the entrance:
  // the entrance is a CSS animation (below) that starts at FIRST PAINT, so a
  // slow-hydrating tablet shows the mark immediately rather than a blank
  // branded rectangle waiting for JavaScript.
  //
  // The delay is charged against time already spent since navigation, so slow
  // hydration shortens the hold instead of extending the total: the 1.2s
  // budget is from the user's first sight of the page, not from React's.
  useEffect(() => {
    if (reduce) return;
    const delay = Math.min(FLY_AT_MS, Math.max(120, FLY_AT_MS - performance.now()));
    const timer = setTimeout(startFlight, delay);
    return () => clearTimeout(timer);
  }, [reduce, startFlight]);

  if (phase === "done") return null;

  return (
    <motion.div
      className="entry-overlay fixed inset-0 z-[70] flex items-center justify-center bg-surface-canvas"
      onPointerDown={finish}
      initial={{ opacity: 1 }}
      animate={{ opacity: phase === "fly" ? 0 : 1 }}
      transition={{
        duration: FADE_S,
        // Hold the canvas solid while the mark flies, then lift.
        delay: phase === "fly" ? FLY_S - 0.1 : 0,
        ease: EASE,
      }}
      onAnimationComplete={() => {
        if (phase === "fly") finish();
      }}
    >
      {/* Entrance by CSS (pre-hydration, from first paint); flight by framer.
          The class is dropped when the flight starts because a filling CSS
          animation outranks inline styles — with it on, the flight transform
          would never be visible. */}
      <motion.div
        ref={logoRef}
        className={phase === "in" ? "entry-logo-in" : undefined}
        initial={false}
        animate={
          phase === "fly" && flight
            ? { opacity: 0.9, scale: flight.scale, x: flight.x, y: flight.y }
            : phase === "fly"
              ? { opacity: 0, scale: 0.6 }
              : { opacity: 1, scale: 1 }
        }
        transition={{ duration: FLY_S, ease: EASE }}
      >
        <ZolvoraLogo size={132} priority />
      </motion.div>
    </motion.div>
  );
}
