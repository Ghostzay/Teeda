import Link from "next/link";
import { ArrowRight, Plus, Receipt, Scissors } from "lucide-react";

import { AssignControls, type FreeTech } from "@/components/dashboard/assign-controls";
import { NeedsAttention, type AttentionInput } from "@/components/dashboard/needs-attention";
import { WhatsComing, type ComingBooking } from "@/components/dashboard/whats-coming";
import { JobCard } from "@/components/job-card";
import { CalendarNudge } from "@/components/schedule/calendar-nudge";
import { WaitPill, WaitTint } from "@/components/live-wait";
import { Stagger, StaggerItem } from "@/components/motion";
import { TurnBoard } from "@/components/turn-board";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireFloorAccess } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import {
  getActiveJobs,
  getActiveTechs,
  getAppointments,
  getFloorStatus,
  getPaymentTotals,
  getRecentlyCompleted,
  getServices,
  getTodayStats,
  getUnmarkedTechs,
} from "@/lib/queries";
import { getTurnQueue } from "@/lib/turn";

export const dynamic = "force-dynamic";

/**
 * The Dashboard — the screen the salon actually stands in front of.
 *
 * This used to be two screens: an abstract "Today" of stat cards, and the
 * Walk-ins queue where the work happened. The stat cards restated numbers that
 * were already in the header and sent you elsewhere to act, so they are gone
 * and the queue is the dashboard.
 *
 * Order is by urgency, not by category: what is wrong, who has waited longest,
 * everyone else waiting, who is in a chair, then the rotation and the money.
 * Staff cards live on Team — an owner does not need the whole roster on screen
 * while she is placing a client.
 */
export default async function DashboardPage() {
  const session = await requireFloorAccess();

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [stats, jobs, queue, floor, finished, totals, techs, services, bookings, unmarked] =
    await Promise.all([
      getTodayStats(),
      getActiveJobs(),
      getTurnQueue(session.salon.id),
      getFloorStatus(),
      getRecentlyCompleted(8),
      getPaymentTotals(),
      getActiveTechs(),
      getServices(),
      getAppointments({ start: dayStart.toISOString(), end: dayEnd.toISOString() }),
      getUnmarkedTechs(7),
    ]);

  // `getActiveJobs` already orders by check-in, so the first is the longest wait.
  const waiting = jobs.filter((job) => job.status === "waiting");
  const inProgress = jobs.filter((job) => job.status === "in_progress");
  const [longest, ...rest] = waiting;

  const freeTechs: FreeTech[] = queue
    .filter((entry) => entry.is_checked_in && !entry.is_busy && !entry.is_booked_now)
    .map((entry) => ({
      tech_id: entry.tech_id,
      full_name: entry.full_name,
      queue_position: entry.queue_position,
    }));

  const now = Date.now();
  const upcoming: ComingBooking[] = bookings
    .filter((booking) => Date.parse(booking.scheduled_at) >= now && booking.status === "scheduled")
    .map((booking) => ({
      id: booking.id,
      at: booking.scheduled_at,
      name: booking.customer?.name ?? "Client",
      service: booking.service_name,
      tech: booking.tech?.full_name ?? null,
    }));

  const attention: AttentionInput = {
    unpaidCount: finished.filter((job) => !job.payment).length,
    waitingSince: waiting.map((job) => job.checked_in_at),
    unassignedBookings: upcoming
      .filter((booking) => booking.tech === null)
      .slice(0, 3)
      .map((booking) => ({ id: booking.id, at: booking.at, name: booking.name })),
    notClockedIn: floor
      .filter((tech) => !tech.is_checked_in && tech.shift_start)
      .slice(0, 3)
      .map((tech) => ({ id: tech.tech_id, name: tech.full_name, from: tech.shift_start })),
  };

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const collected = Number(totals.service_total) + Number(totals.tip_total);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-display">Dashboard</h1>
          <p className="mt-1 text-sm text-secondary-text">
            {today} ·{" "}
            <span className="font-semibold text-primary-text tabular-nums">{stats.checked_in}</span>{" "}
            on rotation ·{" "}
            <span className="font-semibold text-primary-text tabular-nums">{stats.waiting}</span>{" "}
            waiting ·{" "}
            <span className="font-semibold text-primary-text tabular-nums">
              {stats.in_progress}
            </span>{" "}
            in service
          </p>
          <p className="mt-0.5 text-meta text-muted-text">
            Since opening: {stats.completed_today} finished · {stats.appointments_today} booked
          </p>
        </div>

        <Button asChild size="lg" className="shrink-0">
          <Link href="/jobs">
            <Plus className="size-4" />
            Check in a client
          </Link>
        </Button>
      </header>

      <NeedsAttention input={attention} />

      <CalendarNudge techs={unmarked} />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        {/* The working column. */}
        <div className="space-y-5">
          <section
            id="waiting"
            aria-label="Waiting longest"
            className="rounded-2xl border border-subtle bg-surface-raised p-5"
          >
            {longest ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-meta uppercase text-muted-text">Waiting longest</p>
                    <p className="truncate text-title">{longest.customer?.name ?? "Walk-in"}</p>
                    <p className="truncate text-sm text-secondary-text">
                      {longest.service_name}
                      {longest.tech?.full_name ? ` · asked for ${longest.tech.full_name}` : ""}
                    </p>
                  </div>
                  <WaitPill since={longest.checked_in_at} size="large" />
                </div>
                <AssignControls jobId={longest.id} freeTechs={freeTechs} />
              </div>
            ) : (
              <div className="py-2 text-center">
                <p className="text-title">Nobody is waiting</p>
                <p className="mt-1 text-sm text-muted-text">
                  {stats.in_progress > 0
                    ? `${stats.in_progress} ${stats.in_progress === 1 ? "client is" : "clients are"} in service.`
                    : "The floor is clear."}
                </p>
              </div>
            )}
          </section>

          {rest.length > 0 ? (
            <section aria-label="Also waiting" className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-title">Also waiting</h2>
                <span className="text-meta text-muted-text tabular-nums">{rest.length}</span>
              </div>
              <Stagger className="space-y-3">
                {rest.map((job) => (
                  <StaggerItem key={job.id}>
                    <WaitTint since={job.checked_in_at}>
                      <JobCard
                        job={job}
                        techs={techs}
                        services={services}
                        splitPercent={session.salon.tech_split_percent}
                        canManageFloor
                        currentUserId={session.userId}
                      />
                    </WaitTint>
                  </StaggerItem>
                ))}
              </Stagger>
            </section>
          ) : null}

          <section aria-label="In service now" className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-title">In service now</h2>
              <span className="text-meta text-muted-text tabular-nums">{inProgress.length}</span>
            </div>
            {inProgress.length === 0 ? (
              <EmptyState
                icon={Scissors}
                title="No services running right now."
                className="rounded-2xl border border-subtle bg-surface-raised py-8"
              />
            ) : (
              <Stagger className="space-y-3">
                {inProgress.map((job) => (
                  <StaggerItem key={job.id}>
                    <JobCard
                      job={job}
                      techs={techs}
                      services={services}
                      splitPercent={session.salon.tech_split_percent}
                      canManageFloor
                      currentUserId={session.userId}
                    />
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </section>
        </div>

        {/* The watching column — stays put while the desk works the queue. */}
        <div className="space-y-5 xl:sticky xl:top-0">
          <WhatsComing
            bookings={upcoming}
            freeNow={freeTechs.length}
            onShift={stats.checked_in}
          />
          <TurnBoard queue={queue} showFloorControls />
        </div>
      </div>

      {/*
        Money, one strip. Collected is the headline; to-techs and to-salon are
        its two parts. Tips sit inside to-techs — record_payment computes
        tech_amount as (service x split) + tips — so a fourth peer figure made
        four numbers in a row that visibly did not add up.
      */}
      <section
        aria-label="Today's takings"
        className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl border border-subtle bg-surface-raised p-4"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-success-bg text-success">
            <Receipt className="size-5" />
          </span>
          <div>
            <p className="text-metric-sm tabular-nums">{formatMoney(collected)}</p>
            <p className="text-meta text-muted-text">collected today</p>
          </div>
        </div>

        <span className="text-muted-text" aria-hidden>
          =
        </span>

        <div>
          <p className="text-metric-sm tabular-nums">{formatMoney(totals.tech_total)}</p>
          <p className="text-meta text-muted-text">to techs</p>
          <p className="text-meta text-muted-text">includes {formatMoney(totals.tip_total)} tips</p>
        </div>

        <span className="text-muted-text" aria-hidden>
          +
        </span>

        <div>
          <p className="text-metric-sm tabular-nums">{formatMoney(totals.salon_total)}</p>
          <p className="text-meta text-muted-text">to salon</p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {attention.unpaidCount > 0 ? (
            <Button asChild variant="secondary">
              <Link href="/payments">{attention.unpaidCount} unpaid</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link href="/earnings">
              Reports
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
