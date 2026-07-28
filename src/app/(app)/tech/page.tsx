import { CheckCircle2, Coffee } from "lucide-react";

import { CheckInCard } from "@/components/checkin-card";
import { TechEarningsCard } from "@/components/earnings";
import { JobCard } from "@/components/job-card";
import { NotificationsCard } from "@/components/notifications-card";
import { SkillsEditor } from "@/components/skills-editor";
import { TechAppointments } from "@/components/tech-appointments";
import { TurnBoard } from "@/components/turn-board";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/lib/auth";
import { formatMoney, formatRelative } from "@/lib/format";
import {
  amICheckedIn,
  getJobs,
  getNotifications,
  getTechAppointments,
  getTechCurrentJob,
  getTechEarnings,
} from "@/lib/queries";
import { getTurnPosition, getTurnQueue } from "@/lib/turn";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The tech's screen, in the order they need it:
 *   1. Am I on today's rotation?
 *   2. My turn — where I stand, and the client I've been offered
 *   3. What I'm working on
 *   4. What I've earned
 *   5. My book for today and tomorrow
 *   6. The full rotation, so the order is never a mystery
 *
 * No client creation, no job creation — that's front-desk work.
 */
export default async function TechPage() {
  const session = await requireSession();
  const { userId, profile } = session;

  const [
    isCheckedIn,
    currentJob,
    queue,
    position,
    myWaiting,
    completedToday,
    appointments,
    earnings,
    notifications,
  ] = await Promise.all([
    amICheckedIn(),
    getTechCurrentJob(userId),
    getTurnQueue(session.salon.id),
    getTurnPosition(userId, session.salon.id),
    getJobs({ statuses: ["waiting"], techId: userId }),
    getJobs({ statuses: ["completed"], techId: userId, todayOnly: true }),
    getTechAppointments(userId),
    getTechEarnings(userId),
    getNotifications(8),
  ]);

  const isBusy = Boolean(currentJob);
  const isNextUp =
    !isBusy && queue.find((entry) => entry.is_checked_in && !entry.is_busy)?.tech_id === userId;
  const offered = myWaiting.length > 0;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          Hi, {profile.full_name.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          {!isCheckedIn
            ? "Check in below to join today's rotation."
            : isBusy
              ? "You're with a client."
              : offered
                ? "You've been offered a client — accept or pass below."
                : isNextUp
                  ? "You're up next."
                  : position.position
                    ? `You're #${position.position} in today's rotation.`
                    : "You're on the rotation."}
        </p>
      </header>

      {/* 1. Daily opt-in — nothing else works until this is done. */}
      <CheckInCard isCheckedIn={isCheckedIn} />

      <NotificationsCard notifications={notifications} />

      {/* 2. My turn. */}
      {isCheckedIn ? (
        <Card
          className={cn(
            "border-2",
            offered || isNextUp
              ? "border-[var(--status-waiting)]"
              : isBusy
                ? "border-[var(--status-progress)]"
                : "border-border",
          )}
        >
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex size-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <span className="text-3xl font-semibold leading-none tabular-nums">
                {position.position ? `#${position.position}` : "—"}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">
                my turn
              </span>
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-lg font-semibold leading-tight">
                {offered
                  ? "Client waiting for you"
                  : isNextUp
                    ? "You're up next"
                    : isBusy
                      ? "With a client"
                      : "Waiting for a turn"}
              </p>
              <p className="text-sm text-muted-foreground">
                Last turn {formatRelative(position.entry?.last_turn_at)} ·{" "}
                {position.entry?.jobs_today ?? completedToday.length} clients today
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Clients offered to me: big Accept / Pass. */}
      {offered ? (
        <Card>
          <CardHeader>
            <CardTitle>Your next client</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {myWaiting.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                techs={[]}
                services={[]}
                splitPercent={session.salon.tech_split_percent}
                canManageFloor={false}
                currentUserId={userId}
                showTurnActions
              />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* 3. What I'm working on. */}
      <Card>
        <CardHeader>
          <CardTitle>Working on now</CardTitle>
        </CardHeader>
        <CardContent>
          {currentJob ? (
            <JobCard
              job={currentJob}
              techs={[]}
              services={[]}
              splitPercent={session.salon.tech_split_percent}
              canManageFloor={false}
              currentUserId={userId}
            />
          ) : (
            <EmptyState
              icon={Coffee}
              title="No client right now"
              description={
                isCheckedIn
                  ? "The front desk will send your next client through the rotation."
                  : "Check in for turns to start receiving clients."
              }
              className="py-8"
            />
          )}
        </CardContent>
      </Card>

      {/* 4. Earnings. */}
      <TechEarningsCard earnings={earnings} />

      {/* 5. My book. */}
      <TechAppointments today={appointments.today} tomorrow={appointments.tomorrow} />

      {/* 6. Full rotation, for transparency. */}
      <TurnBoard queue={queue} highlightTechId={userId} />

      <SkillsEditor skills={profile.skills} />

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
                <span className="shrink-0 text-muted-foreground">
                  {job.payment ? `${formatMoney(job.payment.tech_amount)} earned` : job.service_name}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
