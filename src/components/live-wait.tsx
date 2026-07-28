"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { formatWait, minutesSince, waitStatus } from "@/lib/wait";

/**
 * A clock that re-renders on a fixed tick.
 *
 * Wait times have to climb on their own — a manager watching the tablet should
 * see 14m become 15m and turn amber without touching anything. Twenty seconds
 * is fine granularity for a number displayed in whole minutes, and cheap enough
 * that every waiting row can hold one.
 */
export function useNow(intervalMs = 20_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}

/**
 * How long this client has been waiting, escalating as it climbs.
 *
 * The colours come from `waitStatus`, never from a prop — that is what keeps a
 * 50-minute wait looking identical on the dashboard, the queue and a job card.
 */
export function WaitPill({
  since,
  className,
  size = "default",
}: {
  since: string | null | undefined;
  className?: string;
  size?: "default" | "large";
}) {
  const now = useNow();
  const status = waitStatus(minutesSince(since, now));

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full tabular-nums",
        size === "large"
          ? "px-3.5 py-1.5 text-metric-sm"
          : "px-2.5 py-1 text-sm font-semibold",
        status.chipClass,
        className,
      )}
      // The colour is the alarm; the label is how it reaches anyone who can't
      // use the colour.
      title={status.label}
    >
      {status.urgent ? (
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full bg-current animate-status-pulse"
        />
      ) : null}
      {formatWait(status.minutes)}
      <span className="sr-only">waiting · {status.label}</span>
    </span>
  );
}

/** Just the number, for places that already have their own container. */
export function WaitText({
  since,
  className,
}: {
  since: string | null | undefined;
  className?: string;
}) {
  const now = useNow();
  const status = waitStatus(minutesSince(since, now));

  return (
    <span className={cn("tabular-nums", status.textClass, className)}>
      {formatWait(status.minutes)}
      <span className="sr-only"> waiting · {status.label}</span>
    </span>
  );
}

/** Row tint for the worst waits. Returns "" below the critical threshold. */
export function useWaitRowClass(since: string | null | undefined): string {
  const now = useNow();
  return waitStatus(minutesSince(since, now)).rowClass;
}

/**
 * Tints its container once the wait crosses the critical threshold.
 *
 * Wrapping rather than threading a class through every list: the escalation
 * rule stays in `waitStatus`, and any row can opt in by being wrapped.
 */
export function WaitTint({
  since,
  children,
  className,
}: {
  since: string | null | undefined;
  children: React.ReactNode;
  className?: string;
}) {
  const rowClass = useWaitRowClass(since);
  return <div className={cn("rounded-xl", rowClass, className)}>{children}</div>;
}
