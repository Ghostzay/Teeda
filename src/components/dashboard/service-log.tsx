"use client";

import { useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, Clock, Footprints, Scissors } from "lucide-react";

import { WaitText, useNow } from "@/components/live-wait";
import { Stagger, StaggerItem, ViewSwap, motion } from "@/components/motion";
import { formatMoney, formatTime, initials } from "@/lib/format";
import type { ServiceLogEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatWait, minutesSince } from "@/lib/wait";

type Tab = "waiting" | "in_progress" | "completed";

const TABS: { id: Tab; label: string; icon: typeof Clock }[] = [
  { id: "waiting", label: "Waiting", icon: Clock },
  { id: "in_progress", label: "In service", icon: Scissors },
  { id: "completed", label: "Finished", icon: CheckCircle2 },
];

/**
 * The day's work, in three tabs.
 *
 * One panel rather than three, because the three questions — who is waiting,
 * who is being served, what has been done — are the same question at different
 * points, and a manager flips between them constantly.
 *
 * The same component serves a tech's own history: `service_log` decides what
 * they are allowed to see in SQL, so this only has to change its title.
 */
export function ServiceLog({
  entries,
  title = "Today's services",
  /** A tech looking at their own day: no tech names, no money that isn't theirs. */
  personal = false,
}: {
  entries: ServiceLogEntry[];
  title?: string;
  personal?: boolean;
}) {
  const now = useNow();
  const [tab, setTab] = useState<Tab>(() => {
    // Open on whichever tab has something in it, most urgent first — a panel
    // that opens on an empty tab reads as broken.
    if (entries.some((entry) => entry.status === "waiting")) return "waiting";
    if (entries.some((entry) => entry.status === "in_progress")) return "in_progress";
    return "completed";
  });

  const counts = useMemo(
    () => ({
      waiting: entries.filter((entry) => entry.status === "waiting").length,
      in_progress: entries.filter((entry) => entry.status === "in_progress").length,
      completed: entries.filter((entry) => entry.status === "completed").length,
    }),
    [entries],
  );

  const shown = entries.filter((entry) => entry.status === tab);
  const takings = entries
    .filter((entry) => entry.status === "completed")
    .reduce((sum, entry) => sum + Number(entry.amount) + Number(entry.tip), 0);

  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-title">{title}</h2>
        {counts.completed > 0 ? (
          <span className="text-meta text-muted-text tabular-nums">
            {counts.completed} finished · {formatMoney(takings)}
          </span>
        ) : null}
      </div>

      <div role="tablist" className="flex gap-1 rounded-xl bg-surface-sunken p-1">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              className={cn(
                "relative flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors",
                active ? "text-primary-text" : "text-muted-text hover:text-primary-text",
              )}
            >
              {active ? (
                <motion.span
                  layoutId={`log-tab-${title}`}
                  transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
                  className="absolute inset-0 rounded-lg bg-surface-overlay"
                />
              ) : null}
              <Icon className="relative size-4 shrink-0" />
              <span className="relative truncate">{label}</span>
              <span className="relative tabular-nums opacity-70">{counts[id]}</span>
            </button>
          );
        })}
      </div>

      <ViewSwap viewKey={tab}>
        {shown.length === 0 ? (
          <p className="rounded-2xl border border-subtle bg-surface-raised px-4 py-8 text-center text-sm text-muted-text">
            {tab === "waiting"
              ? "Nobody is waiting."
              : tab === "in_progress"
                ? "Nothing in a chair right now."
                : "Nothing finished yet today."}
          </p>
        ) : (
          <Stagger className="divide-y divide-subtle overflow-hidden rounded-2xl border border-subtle bg-surface-raised">
            {shown.map((entry) => (
              <StaggerItem key={entry.id}>
                <div className="flex items-center gap-3 px-4 py-2.5">
                  {!personal ? (
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold",
                        entry.tech_id
                          ? "bg-accent-subtle text-accent-default"
                          : "bg-warning-bg text-warning",
                      )}
                      title={entry.tech_name}
                    >
                      {entry.tech_id ? initials(entry.tech_name) : "—"}
                    </span>
                  ) : null}

                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-semibold leading-tight">
                      {entry.is_appointment ? (
                        <CalendarClock className="size-3.5 shrink-0 text-muted-text" />
                      ) : (
                        <Footprints className="size-3.5 shrink-0 text-muted-text" />
                      )}
                      {entry.customer_name}
                    </p>
                    <p className="truncate text-meta text-muted-text">
                      {entry.service_name}
                      {!personal && entry.tech_id ? ` · ${entry.tech_name}` : ""}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    {entry.status === "waiting" ? (
                      <WaitText since={entry.checked_in_at} className="text-sm font-semibold" />
                    ) : entry.status === "in_progress" ? (
                      <p className="text-sm font-semibold tabular-nums text-warning">
                        {formatWait(minutesSince(entry.started_at, now))} in
                      </p>
                    ) : (
                      <>
                        <p className="text-sm font-semibold tabular-nums">
                          {entry.paid
                            ? formatMoney(Number(entry.amount) + Number(entry.tip))
                            : "unpaid"}
                        </p>
                        <p className="text-meta text-muted-text tabular-nums">
                          {formatTime(entry.completed_at)}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </ViewSwap>
    </section>
  );
}
