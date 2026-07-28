import Link from "next/link";
import { CalendarDays, CheckCircle2, Clock, HandCoins, Plus, Scissors, Users, Wallet } from "lucide-react";

import { JobCard } from "@/components/job-card";
import { PaymentDialog } from "@/components/payment-dialog";
import { TurnBoard } from "@/components/turn-board";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireFloorAccess } from "@/lib/auth";
import { formatMoney, formatTime } from "@/lib/format";
import {
  getActiveJobs,
  getActiveTechs,
  getPaymentTotals,
  getRecentlyCompleted,
  getTodayStats,
} from "@/lib/queries";
import { getTurnQueue, suggestNextTechDetailed } from "@/lib/turn";

export const dynamic = "force-dynamic";

/**
 * The floor view for managers and admins.
 *
 * Order is deliberate: rotation first (it's the product), then the clients you
 * can finish, then what just wrapped up, then who's waiting. Numbers sit below
 * the work — they're reference, not the job.
 */
export default async function DashboardPage() {
  const session = await requireFloorAccess();

  const [stats, jobs, techs, queue, suggestion, finished, totals] = await Promise.all([
    getTodayStats(),
    getActiveJobs(),
    getActiveTechs(),
    getTurnQueue(session.salon.id),
    suggestNextTechDetailed(session.salon.id),
    getRecentlyCompleted(6),
    getPaymentTotals(),
  ]);

  const waiting = jobs.filter((job) => job.status === "waiting");
  const inProgress = jobs.filter((job) => job.status === "in_progress");
  const unpaid = finished.filter((job) => !job.payment);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Today on the floor</h1>
          <p className="text-sm text-muted-foreground">
            {suggestion.tech ? (
              <>
                <span className="font-medium text-foreground">{suggestion.tech.full_name}</span> is up
                next. {suggestion.reason}
              </>
            ) : (
              suggestion.reason
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="lg">
            <Link href="/jobs">
              <Plus className="size-4" />
              Check in walk-in
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/appointments">
              <CalendarDays className="size-4" />
              Appointments
            </Link>
          </Button>
        </div>
      </header>

      {/* 1. The rotation — the most prominent element on the page. */}
      <TurnBoard queue={queue} showResetControl />

      {/* 2. In progress: the clients you can finish and take payment for. */}
      <QueueSection
        title="With a tech now"
        count={inProgress.length}
        empty="No services running right now."
        emptyIcon={Scissors}
      >
        {inProgress.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            techs={techs}
            canManageFloor
            currentUserId={session.userId}
          />
        ))}
      </QueueSection>

      {/* 3. Just finished — with a nudge for anything still unpaid. */}
      {finished.length > 0 ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-completed" />
              Just finished
            </CardTitle>
            {unpaid.length > 0 ? (
              <span className="text-sm font-medium text-waiting">{unpaid.length} unpaid</span>
            ) : null}
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {finished.map((job) => (
                <li key={job.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{job.customer?.name ?? "Walk-in"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {job.service_name} · {job.tech?.full_name ?? "Unassigned"} ·{" "}
                      {formatTime(job.completed_at)}
                    </p>
                  </div>

                  {job.payment ? (
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-completed">
                      {formatMoney(
                        Number(job.payment.service_amount) + Number(job.payment.tip_amount),
                      )}
                    </span>
                  ) : (
                    <div className="shrink-0">
                      <PaymentDialog job={job} techs={techs} variant="outline" />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* 4. Waiting. */}
      <QueueSection
        title="Waiting"
        count={waiting.length}
        empty="Nobody is waiting — the floor is clear."
        emptyIcon={Users}
      >
        {waiting.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            techs={techs}
            canManageFloor
            currentUserId={session.userId}
          />
        ))}
      </QueueSection>

      {/* 5. Numbers. */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Clock} label="Waiting" value={String(stats.waiting)} tone="waiting" />
        <Stat icon={Scissors} label="In progress" value={String(stats.inProgress)} tone="progress" />
        <Stat
          icon={CheckCircle2}
          label="Done today"
          value={String(stats.completedToday)}
          tone="completed"
        />
        <Stat
          icon={CalendarDays}
          label="Booked today"
          value={String(stats.appointmentsToday)}
          tone="muted"
        />
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={Wallet}
          label="Collected today"
          value={formatMoney(Number(totals.service_total) + Number(totals.tip_total))}
          tone="completed"
        />
        <Stat icon={HandCoins} label="Tips today" value={formatMoney(totals.tip_total)} tone="waiting" />
        <Stat icon={Wallet} label="Cash" value={formatMoney(totals.cash_total)} tone="muted" />
        <Stat icon={Wallet} label="Card" value={formatMoney(totals.card_total)} tone="muted" />
      </section>
    </div>
  );
}

const TONE_CLASS = {
  waiting: "bg-waiting-bg text-waiting",
  progress: "bg-progress-bg text-progress",
  completed: "bg-completed-bg text-completed",
  muted: "bg-muted text-muted-foreground",
} as const;

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  tone: keyof typeof TONE_CLASS;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${TONE_CLASS[tone]}`}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xl font-semibold leading-none tabular-nums">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function QueueSection({
  title,
  count,
  empty,
  emptyIcon,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  emptyIcon: typeof Clock;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{title}</CardTitle>
        <span className="text-sm font-medium tabular-nums text-muted-foreground">{count}</span>
      </CardHeader>
      <CardContent>
        {count === 0 ? (
          <EmptyState icon={emptyIcon} title={empty} className="py-8" />
        ) : (
          <div className="space-y-3">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}
