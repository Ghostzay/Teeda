import { CheckCircle2, Coffee, Hand } from "lucide-react";

import { JobCard } from "@/components/job-card";
import { TurnBoard } from "@/components/turn-board";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/lib/auth";
import { formatRelative } from "@/lib/format";
import { getJobs, getTechCurrentJob } from "@/lib/queries";
import { getTurnPosition, getTurnQueue } from "@/lib/turn";

export const dynamic = "force-dynamic";

/**
 * The tech's screen: what they're working on, where they sit in the rotation,
 * and the queue they can claim from. Nothing else.
 */
export default async function TechPage() {
  const session = await requireSession();
  const { userId, profile } = session;

  const [currentJob, queue, position, myWaiting, completedToday] = await Promise.all([
    getTechCurrentJob(userId),
    getTurnQueue(session.salon.id),
    getTurnPosition(userId, session.salon.id),
    getJobs({ statuses: ["waiting"], techId: userId }),
    getJobs({ statuses: ["completed"], techId: userId, todayOnly: true }),
  ]);

  const openQueue = (await getJobs({ statuses: ["waiting"] })).filter(
    (job) => job.tech_id === null,
  );

  const isBusy = Boolean(currentJob);
  const isNextUp = !isBusy && queue.find((entry) => !entry.is_busy)?.tech_id === userId;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Hi, {profile.full_name.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">
          {isBusy
            ? "You're with a client."
            : isNextUp
              ? "You're up next — the front desk will send you the next client."
              : position.position
                ? `You're #${position.position} of ${position.total} in the rotation.`
                : "You're not on the rotation right now."}
        </p>
      </header>

      {/* Turn status is the first thing a tech looks for. */}
      <Card
        className={
          isNextUp
            ? "border-l-4 border-l-[var(--status-waiting)]"
            : isBusy
              ? "border-l-4 border-l-[var(--status-progress)]"
              : undefined
        }
      >
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex size-16 shrink-0 flex-col items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <span className="text-2xl font-semibold leading-none tabular-nums">
              {position.position ? `#${position.position}` : "—"}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">turn</span>
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium">
              {isNextUp ? "You're up next" : isBusy ? "With a client" : "Waiting for a turn"}
            </p>
            <p className="text-sm text-muted-foreground">
              Last turn {formatRelative(position.entry?.last_turn_at)} ·{" "}
              {position.entry?.jobs_today ?? completedToday.length} clients today
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current client</CardTitle>
        </CardHeader>
        <CardContent>
          {currentJob ? (
            <JobCard job={currentJob} techs={[]} isManager={false} currentUserId={userId} />
          ) : (
            <EmptyState
              icon={Coffee}
              title="No client right now"
              description="Start one of your assigned clients below, or claim from the open queue."
              className="py-8"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Assigned to you</CardTitle>
          <span className="text-sm font-medium tabular-nums text-muted-foreground">
            {myWaiting.length}
          </span>
        </CardHeader>
        <CardContent>
          {myWaiting.length === 0 ? (
            <EmptyState icon={Hand} title="Nothing assigned yet" className="py-8" />
          ) : (
            <div className="space-y-3">
              {myWaiting.map((job) => (
                <JobCard key={job.id} job={job} techs={[]} isManager={false} currentUserId={userId} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {openQueue.length > 0 ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Open queue</CardTitle>
            <span className="text-sm font-medium tabular-nums text-muted-foreground">
              {openQueue.length}
            </span>
          </CardHeader>
          <CardContent className="space-y-3">
            {openQueue.map((job) => (
              <JobCard key={job.id} job={job} techs={[]} isManager={false} currentUserId={userId} />
            ))}
          </CardContent>
        </Card>
      ) : null}

      <TurnBoard queue={queue} highlightTechId={userId} />

      {completedToday.length > 0 ? (
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <CheckCircle2 className="size-4 text-completed" />
            <CardTitle>Finished today ({completedToday.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {completedToday.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="truncate font-medium">{job.customer?.name ?? "Walk-in"}</span>
                <span className="shrink-0 text-muted-foreground">{job.service_name}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
