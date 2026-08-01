"use client";

import { useCallback, useRef } from "react";

/**
 * Five taps within three seconds — measured from the first tap, not the last.
 *
 * The distinction is the whole point. The obvious implementation restarts a
 * three-second timer on every tap, which is not "five taps in three seconds" at
 * all: it is "five taps, each within three seconds of the one before", and five
 * taps 900ms apart satisfy it after four and a half. That is slow enough to be
 * a rhythm somebody falls into idly, and idle poking at the salon's name is
 * exactly what this must not respond to.
 *
 * Held in a ref rather than state because nothing renders differently for a
 * partial gesture — showing tap 3 of 5 would advertise the way out to the
 * person it is hidden from.
 *
 * One implementation, imported by both screens that need it, so the locked
 * screen and the stalled screen cannot drift into different gestures. A staff
 * member who learns it on one has learned it on the other.
 */
export function useTapGesture(onTrigger: () => void, taps = 5, windowMs = 3000) {
  const started = useRef(0);
  const count = useRef(0);

  return useCallback(() => {
    const now = Date.now();

    // Too slow: this tap is not the fifth of a run, it is the first of a new one.
    if (count.current === 0 || now - started.current > windowMs) {
      started.current = now;
      count.current = 1;
      return;
    }

    count.current += 1;
    if (count.current >= taps) {
      count.current = 0;
      started.current = 0;
      onTrigger();
    }
  }, [onTrigger, taps, windowMs]);
}
