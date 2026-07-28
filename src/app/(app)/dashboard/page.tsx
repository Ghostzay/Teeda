import Link from "next/link";
import { ArrowRight, Plus, Receipt } from "lucide-react";

import { AssignControls, AssignRow, type FreeTech } from "@/components/dashboard/assign-controls";
import { TechRail } from "@/components/dashboard/tech-rail";
import { WaitPill, WaitText } from "@/components/live-wait";
import { Stagger } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { requireFloorAccess } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import {
  getActiveJobs,
  getFloorStatus,
  getPaymentTotals,
  getRecentlyCompleted,
  getTodayStats,
} from "@/lib/queries";
import { getTurnQueue } from "@/lib/turn";

export const dynamic = "force-dynamic";

/**
 * Today on the floor — a control surface, not a report.
 *
 * The order is the order a manager actually needs it in: who has waited
 * longest and who can take them, then the state of every tech, then the rest
 * of the queue, then money. Everything actionable is actionable here; nothing
 * on this page exists only to send you somewhere else.
 */
export default async function DashboardPage() {
  const session = await requireFloorAccess();

  const [stats, jobs, queue, floor, finished, totals] = await Promise.all([
    getTodayStats(),
    getActiveJobs(),
    getTurnQueue(session.salon.id),
    getFloorStatus(),
    getRecentlyCompleted(4),
    getPaymentTotals(),
  ]);

  // Oldest check-in first — `getActiveJobs` already orders by `checked_in_at`.
  const waiting = jobs.filter((job) => job.status === "waiting");
  const [longest, ...rest] = waiting;
  const unpaid = finished.filter((job) => !job.payment).length;

  /*
   * Who can actually take a client right now: checked in, not mid-service, and
   * not inside a booking. Ordered by rotation position so the buttons appear in
   * the order the fairness rule would pick them.
   */
  const freeTechs: FreeTech[] = queue
    .filter((entry) => entry.is_checked_in && !entry.is_busy && !entry.is_booked_now)
    .map((entry) => ({
      tech_id: entry.tech_id,
      full_name: entry.full_name,
      queue_position: entry.queue_position,
    }));

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const collected = Number(totals.service_total) + Number(totals.tip_total);

  return (
    <div className="space-y-5">
      {/*
        One header line, not four stat cards. Three of those four values were
        already in this subtitle, and "Waiting" appeared three times inside
        200px — the counts belong next to the title that frames them.
      */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-display">Today on the floor</h1>
          <p className="mt-1 text-sm text-secondary-text">
            {today} ·{" "}
            <span className="font-semibold text-primary-text tabular-nums">
              {stats.checked_in}
            </span>{" "}
            on rotation ·{" "}
            <span className="font-semibold text-primary-text tabular-nums">{stats.waiting}</span>{" "}
            waiting ·{" "}
            <span className="font-semibold text-primary-text tabular-nums">
              {stats.in_progress}
            </span>{" "}
            in service
          </p>
          {/*
            The two figures that made the old header look broken, stated as what
            they are. "Done today" counts the whole day; "on rotation" counts
            this instant, so they differ every evening once techs clock out —
            that is a fact about the day, not a contradiction.
          */}
          <p className="mt-0.5 text-meta text-muted-text">
            Since opening: {stats.completed_today} finished · {stats.appointments_today} booked
            {stats.checked_in === 0 && stats.completed_today > 0
              ? " · nobody is checked in right now"
              : ""}
          </p>
        </div>

        <Button asChild size="lg" className="shrink-0">
          <Link href="/jobs">
            <Plus className="size-4" />
            Check in a client
          </Link>
        </Button>
      </header>

      {/* Waiting longest — the one client whose situation is deteriorating. */}
      <section
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

      {/* The technician rail — what fills the space below the fold. */}
      <section aria-label="Technicians" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-title">The floor</h2>
          <p className="text-meta text-muted-text tabular-nums">
            {stats.checked_in} of {floor.length} checked in
          </p>
        </div>
        <TechRail techs={floor} />
      </section>

      {/* Everyone else waiting, with the same inline assign. */}
      {rest.length > 0 ? (
        <section aria-label="Also waiting" className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-title">Also waiting</h2>
            <p className="text-meta text-muted-text tabular-nums">{rest.length}</p>
          </div>
          <Stagger className="space-y-2">
            {rest.map((job) => (
              <AssignRow key={job.id} jobId={job.id} freeTechs={freeTechs}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight">
                    {job.customer?.name ?? "Walk-in"}
                  </p>
                  <p className="truncate text-meta text-muted-text">{job.service_name}</p>
                </div>
                <WaitText since={job.checked_in_at} className="shrink-0 text-sm font-semibold" />
              </AssignRow>
            ))}
          </Stagger>
        </section>
      ) : null}

      {/*
        Money, one strip.

        Collected is the headline; to-techs and to-salon are its two parts and
        they sum to it. Tips are *inside* to-techs — record_payment computes
        tech_amount as (service x split) + tips — so showing them as a fourth
        peer figure made four numbers that visibly didn't add up.
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

        <div className="flex items-center gap-2 text-muted-text" aria-hidden>
          =
        </div>

        <div>
          <p className="text-metric-sm tabular-nums">{formatMoney(totals.tech_total)}</p>
          <p className="text-meta text-muted-text">to techs</p>
          <p className="text-meta text-muted-text">
            includes {formatMoney(totals.tip_total)} tips
          </p>
        </div>

        <div className="flex items-center gap-2 text-muted-text" aria-hidden>
          +
        </div>

        <div>
          <p className="text-metric-sm tabular-nums">{formatMoney(totals.salon_total)}</p>
          <p className="text-meta text-muted-text">to salon</p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {unpaid > 0 ? (
            <Button asChild variant="secondary">
              <Link href="/payments">{unpaid} unpaid</Link>
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
