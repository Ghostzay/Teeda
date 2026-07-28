import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Crown,
  Plus,
  Receipt,
  Scissors,
} from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireFloorAccess } from "@/lib/auth";
import { formatDuration, formatMoney, initials } from "@/lib/format";
import { getActiveJobs, getPaymentTotals, getRecentlyCompleted, getTodayStats } from "@/lib/queries";
import { getTurnQueue, suggestNextTechDetailed } from "@/lib/turn";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The one-pager.
 *
 * Everything here answers "what is happening right now?" and nothing else.
 * Lists are capped and link out to their own page, so this screen fits a
 * tablet without scrolling no matter how busy the salon gets.
 */
export default async function DashboardPage() {
  const session = await requireFloorAccess();

  const [stats, jobs, queue, suggestion, finished, totals] = await Promise.all([
    getTodayStats(),
    getActiveJobs(),
    getTurnQueue(session.salon.id),
    suggestNextTechDetailed(session.salon.id),
    getRecentlyCompleted(4),
    getPaymentTotals(),
  ]);

  const waiting = jobs.filter((job) => job.status === "waiting");
  const inProgress = jobs.filter((job) => job.status === "in_progress");
  const onRotation = queue.filter((entry) => entry.is_checked_in);
  const unpaid = finished.filter((job) => !job.payment).length;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today on the floor</h1>
          <p className="text-sm text-muted-foreground">
            {onRotation.length} on rotation · {stats.waiting} waiting · {stats.inProgress} in
            progress
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="lg">
            <Link href="/jobs">
              <Plus className="size-4" />
              Check in
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/queue">
              <Crown className="size-4" />
              Queue
            </Link>
          </Button>
        </div>
      </header>

      {/* Up next — the single most consequential fact on the screen. */}
      <Card className="edge-gold overflow-hidden border-2 border-primary/20">
        {/* Stacks on phones: at narrow widths a side-by-side button squeezes
            the name down to an ellipsis, which is the one thing here that
            must stay readable. */}
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          {suggestion.tech ? (
            <>
              <div className="flex min-w-0 flex-1 items-center gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground">
                {initials(suggestion.tech.full_name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Up next
                </p>
                <p className="truncate text-2xl font-semibold leading-tight">
                  {suggestion.tech.full_name}
                </p>
                <p className="truncate text-sm text-muted-foreground">{suggestion.reason}</p>
              </div>
              </div>
            </>
          ) : (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Up next
              </p>
              <p className="text-lg font-semibold leading-tight">Nobody available</p>
              <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
            </div>
          )}

          <Button asChild variant="secondary" size="lg" className="w-full shrink-0 sm:w-auto">
            <Link href="/queue">
              Manage rotation
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Clock} label="Waiting" value={stats.waiting} tone="waiting" href="/queue" />
        <Stat
          icon={Scissors}
          label="In progress"
          value={stats.inProgress}
          tone="progress"
          href="/queue"
        />
        <Stat
          icon={CheckCircle2}
          label="Done today"
          value={stats.completedToday}
          tone="completed"
          href="/payments"
        />
        <Stat
          icon={CalendarDays}
          label="Booked today"
          value={stats.appointmentsToday}
          tone="muted"
          href="/appointments"
        />
      </section>

      {/* Two short columns rather than one long page. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="With a tech now"
          count={inProgress.length}
          href="/queue"
          linkLabel="Queue"
          empty="Nothing running right now."
        >
          {inProgress.slice(0, 4).map((job) => (
            <Row
              key={job.id}
              name={job.customer?.name ?? "Walk-in"}
              detail={`${job.service_name} · ${job.tech?.full_name ?? "Unassigned"}`}
              trailing={formatDuration(job.started_at)}
              status="in_progress"
            />
          ))}
        </Panel>

        <Panel
          title="Waiting"
          count={waiting.length}
          href="/queue"
          linkLabel="Queue"
          empty="Nobody is waiting."
        >
          {waiting.slice(0, 4).map((job) => (
            <Row
              key={job.id}
              name={job.customer?.name ?? "Walk-in"}
              detail={`${job.service_name} · ${job.tech?.full_name ?? "Nobody yet"}`}
              trailing={formatDuration(job.checked_in_at)}
              status="waiting"
            />
          ))}
        </Panel>
      </div>

      {/* Money, one line. The full breakdown lives on Earnings. */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
          <div className="flex items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-lg bg-completed-bg text-completed">
              <Receipt className="size-5" />
            </div>
            <div>
              <p className="text-xl font-semibold leading-none tabular-nums">
                {formatMoney(Number(totals.service_total) + Number(totals.tip_total))}
              </p>
              <p className="text-xs text-muted-foreground">collected today</p>
            </div>
          </div>

          <Figure label="Tips" value={formatMoney(totals.tip_total)} />
          <Figure label="To techs" value={formatMoney(totals.tech_total)} />
          <Figure label="To salon" value={formatMoney(totals.salon_total)} />

          <div className="ml-auto flex items-center gap-2">
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
        </CardContent>
      </Card>
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
  href,
}: {
  icon: typeof Clock;
  label: string;
  value: number;
  tone: keyof typeof TONE_CLASS;
  href: string;
}) {
  return (
    <Link href={href} className="rounded-xl transition-transform active:scale-[0.99]">
      <Card className="h-full">
        <CardContent className="flex items-center gap-3 p-4">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg",
              TONE_CLASS[tone],
            )}
          >
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-semibold leading-none tabular-nums">{value}</p>
            <p className="truncate text-xs text-muted-foreground">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function Panel({
  title,
  count,
  href,
  linkLabel,
  empty,
  children,
}: {
  title: string;
  count: number;
  href: string;
  linkLabel: string;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2">
          {title}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
        </CardTitle>
        <Link
          href={href}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {linkLabel}
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {count === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y divide-border">{children}</ul>
        )}
        {count > 4 ? (
          <Link
            href={href}
            className="block border-t border-border px-4 py-2.5 text-center text-sm font-medium text-primary"
          >
            {count - 4} more
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Row({
  name,
  detail,
  trailing,
  status,
}: {
  name: string;
  detail: string;
  trailing: string;
  status: "waiting" | "in_progress";
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <StatusBadge status={status} />
      <span className="w-12 shrink-0 text-right text-sm font-medium tabular-nums text-muted-foreground">
        {trailing}
      </span>
    </li>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-base font-semibold leading-none tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
