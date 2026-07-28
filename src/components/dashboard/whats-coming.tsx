import Link from "next/link";
import { ArrowRight, CalendarClock, Users } from "lucide-react";

import { formatTime } from "@/lib/format";

export type ComingBooking = { id: string; at: string; name: string; service: string; tech: string | null };

/**
 * The forward-looking half of the dashboard.
 *
 * Every other number on this screen is a tally of what already happened. This
 * one is the only thing that tells the desk whether to worry about the next
 * hour — how much is still booked, when the next person walks in, and whether
 * there is anyone free to take them.
 */
export function WhatsComing({
  bookings,
  freeNow,
  onShift,
}: {
  bookings: ComingBooking[];
  freeNow: number;
  onShift: number;
}) {
  const next = bookings[0] ?? null;

  return (
    <section
      aria-label="Still to come"
      className="space-y-3 rounded-2xl border border-subtle bg-surface-raised p-4"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-info-bg text-info">
          <CalendarClock className="size-4" />
        </span>
        <h2 className="text-title">Still to come</h2>
      </div>

      <div className="flex items-end gap-5">
        <div>
          <p className="text-metric tabular-nums leading-none">{bookings.length}</p>
          <p className="text-meta text-muted-text">
            {bookings.length === 1 ? "booking left" : "bookings left"} today
          </p>
        </div>
        <div className="border-l border-subtle pl-5">
          <p className="text-metric-sm tabular-nums leading-none">
            {freeNow}
            <span className="text-muted-text">/{onShift}</span>
          </p>
          <p className="text-meta text-muted-text">techs free now</p>
        </div>
      </div>

      {next ? (
        <div className="rounded-xl border border-subtle bg-surface-sunken p-3">
          <p className="text-meta uppercase text-muted-text">Next in</p>
          <p className="truncate font-semibold leading-tight">
            {formatTime(next.at)} · {next.name}
          </p>
          <p className="truncate text-sm text-muted-text">
            {next.service}
            {next.tech ? ` · ${next.tech}` : " · nobody assigned"}
          </p>
        </div>
      ) : (
        <p className="rounded-xl border border-subtle bg-surface-sunken p-3 text-sm text-muted-text">
          Nothing else booked today. Walk-ins only from here.
        </p>
      )}

      {bookings.length > 1 ? (
        <ul className="space-y-1.5">
          {bookings.slice(1, 4).map((booking) => (
            <li key={booking.id} className="flex items-baseline gap-2 text-sm">
              <span className="w-16 shrink-0 tabular-nums text-muted-text">
                {formatTime(booking.at)}
              </span>
              <span className="min-w-0 flex-1 truncate">{booking.name}</span>
              <span className="shrink-0 truncate text-meta text-muted-text">
                {booking.tech ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <Link
        href="/appointments"
        className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-subtle text-sm font-medium transition-colors hover:bg-surface-overlay"
      >
        <Users className="size-4" />
        All bookings
        <ArrowRight className="size-4" />
      </Link>
    </section>
  );
}
