"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, LogIn, Receipt, UserX } from "lucide-react";

import { useNow } from "@/components/live-wait";
import { Stagger, StaggerItem } from "@/components/motion";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { minutesSince, formatWait } from "@/lib/wait";

export type AttentionInput = {
  /** Finished today, money not recorded. */
  unpaidCount: number;
  /** Waiting clients, so the over-30 count can be recomputed as time passes. */
  waitingSince: string[];
  /** Bookings today with nobody assigned yet. */
  unassignedBookings: { id: string; at: string; name: string }[];
  /** Rostered today but never clocked in. */
  notClockedIn: { id: string; name: string; from: string | null }[];
};

type Item = {
  key: string;
  icon: typeof Clock;
  text: string;
  href: string;
  tone: "danger" | "warning";
};

/**
 * The only part of the dashboard that asks for something.
 *
 * Deliberately absent when there is nothing wrong — a panel that says "all
 * clear" every day teaches people to stop reading it, and then it is not there
 * on the day it matters.
 */
export function NeedsAttention({ input }: { input: AttentionInput }) {
  const now = useNow();

  const longWaits = input.waitingSince.filter((since) => minutesSince(since, now) >= 30);
  const worst = longWaits.reduce((max, since) => Math.max(max, minutesSince(since, now)), 0);

  const items: Item[] = [];

  if (longWaits.length > 0) {
    items.push({
      key: "waits",
      icon: Clock,
      tone: "danger",
      text:
        longWaits.length === 1
          ? `1 client has waited ${formatWait(worst)}`
          : `${longWaits.length} clients waiting over 30 min — longest ${formatWait(worst)}`,
      href: "#waiting",
    });
  }

  for (const booking of input.unassignedBookings) {
    items.push({
      key: `booking-${booking.id}`,
      icon: UserX,
      tone: "warning",
      text: `${formatTime(booking.at)} · ${booking.name} has no tech assigned`,
      href: "/appointments",
    });
  }

  if (input.unpaidCount > 0) {
    items.push({
      key: "unpaid",
      icon: Receipt,
      tone: "warning",
      text: `${input.unpaidCount} finished ${input.unpaidCount === 1 ? "ticket has" : "tickets have"} no payment recorded`,
      href: "/payments",
    });
  }

  for (const tech of input.notClockedIn) {
    items.push({
      key: `tech-${tech.id}`,
      icon: LogIn,
      tone: "warning",
      text: `${tech.name} is rostered${tech.from ? ` from ${formatTime(tech.from)}` : ""} but hasn't checked in`,
      href: "/staff",
    });
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-success-border bg-success-bg px-4 py-3 text-success">
        <CheckCircle2 className="size-4 shrink-0" />
        <p className="text-sm font-medium">Nothing needs attention right now.</p>
      </div>
    );
  }

  return (
    <section
      aria-label="Needs attention"
      className="overflow-hidden rounded-2xl border border-danger-border bg-surface-raised"
    >
      <header className="flex items-center gap-2.5 border-b border-subtle bg-danger-bg px-4 py-2.5 text-danger">
        <AlertTriangle className="size-4 shrink-0" />
        <h2 className="text-sm font-semibold uppercase tracking-wide">Needs attention</h2>
        <span className="ml-auto text-sm font-bold tabular-nums">{items.length}</span>
      </header>

      <Stagger className="divide-y divide-subtle">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <StaggerItem key={item.key}>
              <Link
                href={item.href}
                className="flex min-h-12 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-overlay"
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    item.tone === "danger" ? "text-danger" : "text-warning",
                  )}
                />
                <span className="min-w-0 flex-1 text-sm">{item.text}</span>
                <ArrowRight className="size-4 shrink-0 text-muted-text" />
              </Link>
            </StaggerItem>
          );
        })}
      </Stagger>
    </section>
  );
}
