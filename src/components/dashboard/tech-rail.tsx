"use client";

import { Coffee, LogIn, Scissors, Timer } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { useNow } from "@/components/live-wait";
import { Stagger, StaggerItem } from "@/components/motion";
import { checkInForTurns } from "@/lib/actions/rotation";
import { formatMoney, formatTime, initials } from "@/lib/format";
import type { FloorStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatWait, minutesSince } from "@/lib/wait";

/**
 * One card per technician — what an owner watches all day.
 *
 * Four states, and only four, because ambiguity here is what makes people walk
 * over and ask: free, in service, on a break, not clocked in.
 */
type Presence = {
  key: "in_service" | "break" | "free" | "off";
  label: string;
  detail: string;
  className: string;
  icon: typeof Scissors;
};

function presenceOf(tech: FloorStatus, now: number): Presence {
  if (tech.current_job_id) {
    const elapsed = minutesSince(tech.started_at, now);
    return {
      key: "in_service",
      label: "In service",
      // A walk-in has no planned finish. Rather than invent a countdown, say
      // how long they have been in the chair and leave it at that.
      detail: tech.expected_end
        ? `${formatTime(tech.expected_end)} · ${formatWait(elapsed)} in`
        : `${formatWait(elapsed)} in the chair`,
      className: "bg-warning-bg text-warning border-warning-border",
      icon: Scissors,
    };
  }

  if (tech.break_until) {
    return {
      key: "break",
      label: "On break",
      detail: `Back ${formatTime(tech.break_until)}`,
      className: "bg-info-bg text-info border-info-border",
      icon: Coffee,
    };
  }

  if (tech.is_checked_in) {
    return {
      key: "free",
      label: "Free",
      detail:
        tech.queue_position !== null ? `#${tech.queue_position} in rotation` : "On the rotation",
      className: "bg-success-bg text-success border-success-border",
      icon: Timer,
    };
  }

  return {
    key: "off",
    label: "Not clocked in",
    detail: tech.shift_start ? `Rostered ${formatTime(tech.shift_start)}` : "No shift today",
    className: "bg-surface-overlay text-muted-text border-subtle",
    icon: LogIn,
  };
}

export function TechRail({ techs }: { techs: FloorStatus[] }) {
  const now = useNow();

  if (techs.length === 0) {
    return (
      <p className="rounded-2xl border border-subtle bg-surface-raised p-6 text-center text-sm text-muted-text">
        No technicians on the roster yet. Add your team under Business → Team.
      </p>
    );
  }

  return (
    <Stagger className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {techs.map((tech) => {
        const presence = presenceOf(tech, now);
        const Icon = presence.icon;

        return (
          <StaggerItem key={tech.tech_id}>
            <article
              className={cn(
                "flex h-full flex-col gap-3 rounded-2xl border bg-surface-raised p-4 transition-colors",
                presence.key === "off" ? "border-subtle opacity-75" : "border-subtle",
              )}
            >
              <header className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    tech.is_checked_in
                      ? "bg-accent-default text-on-accent"
                      : "bg-surface-overlay text-muted-text",
                  )}
                >
                  {initials(tech.full_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold leading-tight">{tech.full_name}</p>
                  <p className="truncate text-meta text-muted-text">
                    {tech.shift_start && tech.shift_end
                      ? `${formatTime(tech.shift_start)}–${formatTime(tech.shift_end)}`
                      : "No shift set"}
                  </p>
                </div>
              </header>

              <div
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2",
                  presence.className,
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-tight">{presence.label}</p>
                  <p className="truncate text-meta opacity-90">
                    {tech.current_client ? `${tech.current_client} · ` : ""}
                    {presence.detail}
                  </p>
                </div>
              </div>

              <div className="mt-auto flex items-end justify-between gap-3">
                <div>
                  <p className="text-metric-sm tabular-nums">{tech.jobs_today}</p>
                  <p className="text-meta text-muted-text">clients today</p>
                </div>
                <div className="text-right">
                  <p className="text-metric-sm tabular-nums">
                    {formatMoney(Number(tech.earnings_today))}
                  </p>
                  <p className="text-meta text-muted-text">earned today</p>
                </div>
              </div>

              {presence.key === "off" ? (
                <ActionButton
                  action={checkInForTurns}
                  fields={{ tech_id: tech.tech_id }}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <LogIn className="size-4" />
                  Check in for turns
                </ActionButton>
              ) : null}
            </article>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}
