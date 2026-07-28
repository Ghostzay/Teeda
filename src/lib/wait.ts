/**
 * How long a client has been waiting, and how loudly to say so.
 *
 * This is the single source of that judgement. Every place a waiting client
 * appears — the dashboard hero, the queue rows, the job cards — asks this
 * function instead of writing its own thresholds, so a client who is urgent on
 * one screen can never look routine on another.
 *
 * Thresholds are in minutes and deliberately blunt; a front desk should be able
 * to state the rule from memory.
 */

export type WaitLevel = "calm" | "warning" | "danger" | "critical";

export type WaitStatus = {
  level: WaitLevel;
  minutes: number;
  /** Tailwind classes for the pill or chip. Status tokens only, never a hue. */
  chipClass: string;
  /** Text colour on its own, for a duration printed without a pill. */
  textClass: string;
  /**
   * Row tint for the top band only. Empty below 45 minutes — tinting every row
   * would mean tinting means nothing.
   */
  rowClass: string;
  /** Plain words, for screen readers and for the "why" line. */
  label: string;
  /** True past 45 minutes: the row should be impossible to miss. */
  urgent: boolean;
};

const CALM: Omit<WaitStatus, "minutes"> = {
  level: "calm",
  chipClass: "bg-surface-overlay text-secondary-text",
  textClass: "text-secondary-text",
  rowClass: "",
  label: "Just arrived",
  urgent: false,
};

const WARNING: Omit<WaitStatus, "minutes"> = {
  level: "warning",
  chipClass: "bg-warning-bg text-warning border border-warning-border",
  textClass: "text-warning",
  rowClass: "",
  label: "Waiting a while",
  urgent: false,
};

const DANGER: Omit<WaitStatus, "minutes"> = {
  level: "danger",
  chipClass: "bg-danger-bg text-danger border border-danger-border",
  textClass: "text-danger",
  rowClass: "",
  label: "Waiting too long",
  urgent: false,
};

const CRITICAL: Omit<WaitStatus, "minutes"> = {
  level: "critical",
  chipClass: "bg-danger-bg text-danger border border-danger-border font-semibold",
  textClass: "text-danger",
  // The whole row, not just the pill — this one has to carry across a room.
  rowClass: "bg-danger-bg/60 border-danger-border",
  label: "Waiting far too long",
  urgent: true,
};

/**
 * minutes → status.
 *
 *    < 15   calm
 *   15–30   warning
 *   30–45   danger
 *    > 45   danger, plus the row tinted
 */
export function waitStatus(minutes: number): WaitStatus {
  const clamped = Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : 0;

  if (clamped >= 45) return { ...CRITICAL, minutes: clamped };
  if (clamped >= 30) return { ...DANGER, minutes: clamped };
  if (clamped >= 15) return { ...WARNING, minutes: clamped };
  return { ...CALM, minutes: clamped };
}

/** Minutes elapsed since an ISO timestamp. Null-safe: no timestamp = 0. */
export function minutesSince(iso: string | null | undefined, now: number = Date.now()): number {
  if (!iso) return 0;
  const started = Date.parse(iso);
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((now - started) / 60_000));
}

export function waitStatusSince(iso: string | null | undefined, now?: number): WaitStatus {
  return waitStatus(minutesSince(iso, now));
}

/** "8m" / "1h 20m" — compact enough for a pill, exact enough to argue with. */
export function formatWait(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
