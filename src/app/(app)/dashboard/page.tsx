import Link from "next/link";
import { ArrowRight, Plus, Receipt, Scissors } from "lucide-react";

import { AssignControls, type FreeTech } from "@/components/dashboard/assign-controls";
import { DashboardCanvas } from "@/components/dashboard/dashboard-canvas";
import { NeedsAttention, type AttentionInput } from "@/components/dashboard/needs-attention";
import { TakingsTrend } from "@/components/dashboard/takings-trend";
import { TechRail } from "@/components/dashboard/tech-rail";
import { UnpaidTickets } from "@/components/dashboard/unpaid-tickets";
import { WhatsComing, type ComingBooking } from "@/components/dashboard/whats-coming";
import { JobCard } from "@/components/job-card";
import { CalendarNudge } from "@/components/schedule/calendar-nudge";
import { WaitPill, WaitTint } from "@/components/live-wait";
import { Stagger, StaggerItem } from "@/components/motion";
import { TurnBoard } from "@/components/turn-board";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireFloorAccess } from "@/lib/auth";
import { requiredData, resolveLayout, type WidgetId } from "@/lib/dashboard";
import { formatMoney } from "@/lib/format";
import {
  getActiveJobs,
  getActiveTechs,
  getAppointments,
  getFloorStatus,
  getPaymentTotals,
  getRecentlyCompleted,
  getServices,
  getTakingsComparison,
  getTodayStats,
  getUnmarkedTechs,
} from "@/lib/queries";
import { getTurnQueue } from "@/lib/turn";

export const dynamic = "force-dynamic";

/**
 * The Dashboard — the screen the salon stands in front of, arranged how they
 * want it.
 *
 * The page's job is now: resolve the layout, fetch only what the *visible*
 * widgets need, render each one, and hand the finished nodes to the canvas.
 * Hiding a panel therefore makes the page genuinely faster rather than merely
 * shorter — a salon with a large roster stops paying for a floor query nobody
 * is looking at.
 */
export default async function DashboardPage() {
  const session = await requireFloorAccess();

  const layout = resolveLayout(
    session.profile.dashboard_layout,
    session.salon.default_dashboard_layout,
    session.role,
  );
  const needs = requiredData(layout);

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  // The header always shows the counts, so `stats` is unconditional. Everything
  // else is gated on some visible widget actually asking for it.
  const [stats, jobs, queue, floor, finished, totals, techs, services, bookings, unmarked, trend] =
    await Promise.all([
      getTodayStats(),
      needs.has("jobs") ? getActiveJobs() : Promise.resolve([]),
      needs.has("queue") ? getTurnQueue(session.salon.id) : Promise.resolve([]),
      needs.has("floor") ? getFloorStatus() : Promise.resolve([]),
      needs.has("finished") ? getRecentlyCompleted(12) : Promise.resolve([]),
      needs.has("totals") ? getPaymentTotals() : Promise.resolve(null),
      needs.has("techs") ? getActiveTechs() : Promise.resolve([]),
      needs.has("services") ? getServices() : Promise.resolve([]),
      needs.has("bookings")
        ? getAppointments({ start: dayStart.toISOString(), end: dayEnd.toISOString() })
        : Promise.resolve([]),
      needs.has("unmarked") ? getUnmarkedTechs(7) : Promise.resolve([]),
      needs.has("trend") ? getTakingsComparison() : Promise.resolve(null),
    ]);

  // `getActiveJobs` already orders by check-in, so the first is the longest wait.
  const waiting = jobs.filter((job) => job.status === "waiting");
  const inProgress = jobs.filter((job) => job.status === "in_progress");
  const [longest, ...rest] = waiting;
  const unpaid = finished.filter((job) => !job.payment);

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
    unpaidCount: unpaid.length,
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

  const visible = new Set<WidgetId>([...layout.full, ...layout.main, ...layout.side]);
  const nodes: Partial<Record<WidgetId, React.ReactNode>> = {};

  if (visible.has("needs_attention")) {
    nodes.needs_attention = <NeedsAttention input={attention} />;
  }

  if (visible.has("calendar_gaps")) {
    nodes.calendar_gaps = <CalendarNudge techs={unmarked} />;
  }

  if (visible.has("waiting_longest")) {
    nodes.waiting_longest = (
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
    );
  }

  if (visible.has("waiting_queue") && rest.length > 0) {
    nodes.waiting_queue = (
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
    );
  }

  if (visible.has("in_service")) {
    nodes.in_service = (
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
    );
  }

  if (visible.has("whats_coming")) {
    nodes.whats_coming = (
      <WhatsComing bookings={upcoming} freeNow={freeTechs.length} onShift={stats.checked_in} />
    );
  }

  if (visible.has("takings_trend") && trend) {
    nodes.takings_trend = <TakingsTrend data={trend} />;
  }

  if (visible.has("turn_rotation")) {
    nodes.turn_rotation = <TurnBoard queue={queue} showFloorControls />;
  }

  if (visible.has("floor_cards")) {
    nodes.floor_cards = (
      <section aria-label="On the floor" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-title">On the floor</h2>
          <span className="text-meta text-muted-text tabular-nums">
            {floor.filter((tech) => tech.is_checked_in).length} of {floor.length} checked in
          </span>
        </div>
        <TechRail techs={floor} />
      </section>
    );
  }

  if (visible.has("unpaid_tickets")) {
    nodes.unpaid_tickets = (
      <UnpaidTickets
        jobs={unpaid}
        techs={techs}
        services={services}
        splitPercent={session.salon.tech_split_percent}
      />
    );
  }

  if (visible.has("money") && totals) {
    const collected = Number(totals.service_total) + Number(totals.tip_total);
    nodes.money = (
      /*
        Collected is the headline; to-techs and to-salon are its two parts.
        Tips sit inside to-techs — record_payment computes tech_amount as
        (service x split) + tips — so a fourth peer figure made four numbers in
        a row that visibly did not add up.
      */
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
          {unpaid.length > 0 ? (
            <Button asChild variant="secondary">
              <Link href="/payments">{unpaid.length} unpaid</Link>
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
    );
  }

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

      <DashboardCanvas layout={layout} nodes={nodes} role={session.role} />
    </div>
  );
}
