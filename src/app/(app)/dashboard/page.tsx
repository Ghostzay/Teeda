import Link from "next/link";
import { CalendarDays, CheckCircle2, Clock, Plus, Scissors, Users } from "lucide-react";

import { JobCard } from "@/components/job-card";
import { TurnBoard } from "@/components/turn-board";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireManager } from "@/lib/auth";
import { getActiveJobs, getActiveTechs, getTodayStats } from "@/lib/queries";
import { getTurnQueue, suggestNextTechDetailed } from "@/lib/turn";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireManager();

  const [stats, jobs, techs, queue, suggestion] = await Promise.all([
    getTodayStats(),
    getActiveJobs(),
    getActiveTechs(),
    getTurnQueue(session.salon.id),
    suggestNextTechDetailed(session.salon.id),
  ]);

  const waiting = jobs.filter((job) => job.status === "waiting");
  const inProgress = jobs.filter((job) => job.status === "in_progress");

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
            <Link href="/jobs?new=1">
              <Plus className="size-4" />
              Check in
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/appointments">
              <CalendarDays className="size-4" />
              Booked
            </Link>
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Clock} label="Waiting" value={stats.waiting} tone="waiting" />
        <Stat icon={Scissors} label="In progress" value={stats.inProgress} tone="progress" />
        <Stat icon={CheckCircle2} label="Done today" value={stats.completedToday} tone="completed" />
        <Stat icon={CalendarDays} label="Booked today" value={stats.appointmentsToday} tone="muted" />
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
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
                isManager
                currentUserId={session.userId}
              />
            ))}
          </QueueSection>

          <QueueSection
            title="In progress"
            count={inProgress.length}
            empty="No services running right now."
            emptyIcon={Scissors}
          >
            {inProgress.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                techs={techs}
                isManager
                currentUserId={session.userId}
              />
            ))}
          </QueueSection>
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <TurnBoard queue={queue} showResetControl />
        </div>
      </div>
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
  value: number;
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
          <p className="text-2xl font-semibold leading-none tabular-nums">{value}</p>
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
